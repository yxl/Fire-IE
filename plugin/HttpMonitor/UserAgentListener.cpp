/*
This file is part of Fire-IE.

Fire-IE is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

Fire-IE is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with Fire-IE.  If not, see <http://www.gnu.org/licenses/>.
*/

/* Local loopback server to retrieve "real" user-agent used by IE9+ */

#include "StdAfx.h"

#pragma comment(lib, "Rpcrt4.lib")

#include "UserAgentListener.h"
#include "HTTP.h"
#include "re/RegExp.h"

using namespace HttpMonitor;
using namespace re;

UserAgentListener::UserAgentListener(RunAsyncFunc runAsync, int minPort, int maxPort)
	: runAsync(runAsync), minPort(minPort), maxPort(maxPort)
{
	listeningPort = -1;
	generateGUID();
	AfxBeginThread(listenerThread, reinterpret_cast<void*>(this));
}

void UserAgentListener::registerURLCallback(URLCallbackFunc callback)
{
	urlCallback = callback;
	if (listeningPort != -1)
		callURLCallback();
}

void UserAgentListener::registerUserAgentCallback(UserAgentCallbackFunc callback)
{
	userAgentCallback = callback;
	if (userAgent.GetLength())
		callUserAgentCallback();
}

int UserAgentListener::getRandomPort() const
{
	unsigned int rnd;
	rand_s(&rnd);
	return rnd % (maxPort - minPort) + minPort;
}

CString UserAgentListener::getLoopbackURL() const
{
	TCHAR szPort[10] = { 0 };
	_itot_s(listeningPort, szPort, 10);
	return _T("http://127.0.0.1:") + CString(szPort) + _T("/") + guid;
}

void UserAgentListener::generateGUID()
{
	UUID uuid;
	if (RPC_S_OK == UuidCreate(&uuid))
	{
		RPC_WSTR lprpcwstrUUID;
		if (RPC_S_OK == UuidToString(&uuid, &lprpcwstrUUID))
		{
			guid = (LPCWSTR)lprpcwstrUUID;
			RpcStringFree(&lprpcwstrUUID);
		}
	}
}

UINT UserAgentListener::listenerThread(void* param)
{
	UserAgentListener* listener = reinterpret_cast<UserAgentListener*>(param);
	return listener->listenerThread();
}

UINT UserAgentListener::listenerThread()
{
	int ret = 0;

	WSAData wsaData;
	if (0 != WSAStartup(MAKEWORD(2, 2), &wsaData))
	{
		TRACE("[UA Listener] Failed to initialize WinSocket.\n");
		return -1;
	}

	do
	{
		int listeningPort = -1;
		SOCKET listenSocket = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
		if (INVALID_SOCKET == listenSocket)
		{
			TRACE("[UA Listener] Failed to create listenSocket, error = %d.\n", WSAGetLastError());
			ret = -1;
			break;
		}

		sockaddr_in sa_listener;
		ZeroMemory(&sa_listener, sizeof(sa_listener));
		sa_listener.sin_addr.S_un.S_addr = htonl(INADDR_LOOPBACK);
		sa_listener.sin_family = AF_INET;
		for (int tryCount = 0; tryCount < MAX_TRIES; tryCount++)
		{
			int port = getRandomPort();
			sa_listener.sin_port = htons(port);
			if (SOCKET_ERROR == ::bind(listenSocket, (const sockaddr*)&sa_listener, sizeof(sa_listener)))
			{
				TRACE("[UA Listener] Failed to bind on port %d, error = %d.\n", port, WSAGetLastError());
				continue;
			}
			if (SOCKET_ERROR == ::listen(listenSocket, SOMAXCONN))
			{
				TRACE("[UA Listener] Failed to listen on port %d, error = %d.\n", port, WSAGetLastError());
				continue;
			}
			listeningPort = port;
			break;
		}
		if (-1 == listeningPort)
		{
			TRACE("[UA Listener] Cannot listen on %d random ports tried between %d and %d, quitting.\n",
				MAX_TRIES, minPort, maxPort);
			closesocket(listenSocket);
			ret = -1;
			break;
		}

		TRACE("[UA Listener] Listening on port %d.\n", listeningPort);
		runAsync([=] {
			this->listeningPort = listeningPort;
			callURLCallback();
		});

		// We're ready to accept connections
		bool userAgentDone = false;
		while (!userAgentDone)
		{
			sockaddr_in sa_remote;
			ZeroMemory(&sa_remote, sizeof(sa_remote));
			int sa_len = sizeof(sa_remote);
			SOCKET remoteSocket = ::accept(listenSocket, (sockaddr*)&sa_remote, &sa_len);
			if (INVALID_SOCKET == remoteSocket)
			{
				TRACE("[UA Listener] Failed to accept connection, error = %d.\n", WSAGetLastError());
				continue;
			}

			auto byteaddr = sa_listener.sin_addr.S_un.S_un_b;
			TRACE("[UA Listener] Received connection from %d.%d.%d.%d:%d.\n",
				byteaddr.s_b1, byteaddr.s_b2, byteaddr.s_b3, byteaddr.s_b4, ntohs(sa_remote.sin_port));

			userAgentDone = serveSocket(remoteSocket);

			closesocket(remoteSocket);
		}

		closesocket(listenSocket);

	} while (false);

	WSACleanup();
	return ret;
}

UserAgentListener::ProcessContext::ProcessContext()
{
	requestLineDone = requestDone = userAgentDone = urlMatch = false;
}

bool UserAgentListener::serveSocket(SOCKET socket)
{
	const int RECV_BUF_LEN = 1024;
	char recv_buf[RECV_BUF_LEN + 1] = { 0 };
	CStringA content;
	int bytesReceived;
	ProcessContext context;
	do
	{
		bytesReceived = recv(socket, recv_buf, RECV_BUF_LEN, 0);
		if (bytesReceived > 0)
		{
			recv_buf[bytesReceived] = '\0';
			content += recv_buf;
			int retIndex = content.Find("\r\n");
			while (retIndex != -1)
			{
				CString nextLine(content.Mid(0, retIndex));
				processLine(nextLine, context);
				content = content.Mid(retIndex + 2);
				retIndex = content.Find("\r\n");
			}
		}
		else if (bytesReceived == 0)
		{
			processLine(CString(content), context);
		}
		else // bytesReceived < 0
		{
			TRACE("[UA Listener] Failed to receive data, error = %d.\n", WSAGetLastError());
		}
	} while (!context.requestDone && bytesReceived > 0);

	if (context.requestDone && context.urlMatch)
	{
		sendPlaceholderPage(socket);
	}

	return context.userAgentDone;
}

static const RegExp reRequestLine = _T("/^GET\\s([^\\s]+)\\sHTTP\\/[\\d\\.]+$/");

void UserAgentListener::processLine(const CString& line, ProcessContext& context)
{
	CString trimmed = CString(line).Trim();
	if (trimmed.GetLength() == 0)
	{
		context.requestDone = true;
		return;
	}

	if (!context.requestLineDone)
	{
		TRACE(_T("[UA Listener] [Request Line] %s\n"), trimmed);
		RegExpMatch match;
		if (reRequestLine.exec(match, trimmed.GetString()))
		{
			CString requestURL = match.substrings[1].c_str();
			context.urlMatch = requestURL.GetLength() >= guid.GetLength()
				&& requestURL.Mid(requestURL.GetLength() - guid.GetLength()) == guid;
		}
		context.requestLineDone = true;
		return;
	}

	TRACE(_T("[UA Listener] [Request Header] %s\n"), trimmed);
	if (context.userAgentDone) return;

	if (context.urlMatch)
	{
		LPCTSTR lpFieldName = _T("user-agent:");
		LPTSTR lpUserAgent = StrStrI(trimmed.GetString(), lpFieldName);
		if (lpUserAgent)
		{
			CString userAgent = CString(lpUserAgent + _tcslen(lpFieldName)).Trim();
			TRACE(_T("[UA Listener] Extracted user-agent: %s\n"), userAgent);
			context.userAgentDone = true;
			runAsync([=] {
				this->userAgent = userAgent;
				callUserAgentCallback();
			});
		}
	}
}

void UserAgentListener::sendPlaceholderPage(SOCKET socket)
{
	TRACE("[UA Listener] Sending placeholder page...\n");
	CHAR sendBuf[] =
		"HTTP/1.0 200 OK\r\n"
		"Content-Type: text/html;charset=utf-8\r\n"
		"Connection: Close\r\n"
		"Cache-Control: no-cache\r\n"
		"Server: fireie@fireie.org::UserAgentListener/1.0\r\n"
		"\r\n"
		"<!DOCTYPE html>\r\n"
		"<html>\r\n"
		"  <head>\r\n"
		"    <meta charset=\"utf-8\" />\r\n"
		"    <title></title>\r\n"
		"  </head>\r\n"
		"  <body>\r\n"
		"  </body>\r\n"
		"</html>\r\n";

	if (SOCKET_ERROR == send(socket, sendBuf, sizeof(sendBuf) - 1, 0))
	{
		TRACE("[UA Listener] Failed to send placeholder page, error = %d.\n", WSAGetLastError());
	}
	else
	{
		TRACE("[UA Listener] Placeholder page successfully sent.\n");
	}
}

void UserAgentListener::callURLCallback() const
{
	if (urlCallback)
		urlCallback(getLoopbackURL());
}

void UserAgentListener::callUserAgentCallback() const
{
	if (userAgentCallback)
		userAgentCallback(userAgent);
}
