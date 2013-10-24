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
#pragma once

/* Local loopback server to retrieve "real" user-agent used by IE9+ */

#include <functional>

namespace HttpMonitor {
	// Local loopback server to retrieve "real" user-agent used by IE9+
	// Public member functions of this class should be called on the main thread
	class UserAgentListener {
	public:
		typedef std::function<void (std::function<void ()>)> RunAsyncFunc;
		typedef std::function<void (const CString& url)> URLCallbackFunc;
		typedef std::function<void (const CString& userAgent)> UserAgentCallbackFunc;

		UserAgentListener(RunAsyncFunc runAsync, int minPort, int maxPort);

		void registerURLCallback(URLCallbackFunc callback);
		void registerUserAgentCallback(UserAgentCallbackFunc callback);
	private:
		RunAsyncFunc runAsync;
		int minPort, maxPort;
		int listeningPort;
		CString userAgent;

		static const int MAX_TRIES = 100;
		
		URLCallbackFunc urlCallback;
		UserAgentCallbackFunc userAgentCallback;

		int getRandomPort() const;
		CString getLoopbackURL() const;

		// listener code, etc...
		static UINT listenerThread(void* param);
		UINT listenerThread();
		void callURLCallback() const;
		void callUserAgentCallback() const;

		bool serveSocket(SOCKET socket);
		void processLine(const CString& line, bool& requestDone, bool& userAgentDone);
		static void sendPlaceholderPage(SOCKET socket);
	};
} // namespace HttpMonitor
