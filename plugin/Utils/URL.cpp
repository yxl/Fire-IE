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

// URL.cpp : URL utilities
//

#include "StdAfx.h"
#include "URL.h"
#include "TLD.h"
#include "re/RegExp.h"
#include "re/strutils.h"
#include <algorithm>

using namespace Utils;
using namespace re;
using namespace re::strutils;
using namespace std;

namespace Utils {

CString GetHostFromUrl(const CString& strUrl)
{
	return URLTokenizer(strUrl.GetString()).domain.c_str();
}

CString GetProtocolFromUrl(const CString& strUrl)
{
	CString protocol = URLTokenizer(strUrl.GetString()).protocol.c_str();
	if (protocol.GetLength() == 0)
		protocol = _T("http");
	return protocol;
}

CString GetPathFromUrl(const CString& strUrl)
{
	return URLTokenizer(strUrl.GetString()).getPathWithoutFile().c_str();
}

CString GetURLRelative(const CString& baseURL, const CString& relativeURL)
{
	return URLTokenizer(baseURL.GetString()).getRelativeURL(relativeURL.GetString()).c_str();
}

bool IsThirdPartyRequest(const CString& request, const CString& referer)
{
	CString host1 = GetHostFromUrl(request).MakeLower();
	CString host2 = GetHostFromUrl(referer).MakeLower();
	return TLD::getEffectiveDomain(host1) != TLD::getEffectiveDomain(host2);
}

bool IsSubDomain(const CString& subdomain, const CString& domain)
{
	if (subdomain == domain) return true;

	// sub domain test by prepending dot('.') to domain
	const TCHAR* iter1 = subdomain.GetString();
	const TCHAR* iter1end = iter1 + subdomain.GetLength();

	CString dotDomain = _T(".") + domain;
	const TCHAR* iter2 = dotDomain.GetString();
	const TCHAR* iter2end = iter2 + dotDomain.GetLength();

	const TCHAR* pos = find_end(iter1, iter1end, iter2, iter2end);

	if (pos == iter1end) return false;
	return pos + dotDomain.GetLength() == iter1end;
}

} // namespace Utils

const RegExp URLTokenizer::tokenizerRegExp = L"/^(?=[^&])(?:([^:\\/?#]+):)?(?:\\/\\/(?:([^\\/\\:@?#]*)(?:\\:([^\\/@?#]*))?@)?([^\\/\\:?#]*)(?:\\:([^\\/?#]+))?)?([^?#]*)(?:\\?([^#]*))?(?:#(.*))?/";

bool URLTokenizer::tokenize(const wstring& url)
{
	RegExpMatch* match = tokenizerRegExp.exec(url);
	if (match)
	{
		protocol = match->substrings[1];
		username = match->substrings[2];
		password = match->substrings[3];
		domain   = match->substrings[4];
		port     = match->substrings[5];
		path     = match->substrings[6];
		query    = match->substrings[7];
		anchor   = match->substrings[8];
		delete match;
		return true;
	}
	else
	{
		protocol = username = password = domain = port = path = query = anchor = L"";
		return false;
	}
}

wstring URLTokenizer::assemble() const
{
	wstring result;
	if (protocol.length())
		result.append(protocol).append(1, L':');
	wstring authority = getAuthority();
	if (authority.length() || toLowerCase(protocol) == L"file") // special case for file uris
		result.append(L"//").append(authority);
	result.append(path);
	if (query.length())
		result.append(1, L'?').append(query);
	if (anchor.length())
		result.append(1, L'#').append(anchor);

	return result;
}

wstring URLTokenizer::getAuthority() const
{
	wstring authority;
	if (username.length() || password.length())
	{
		authority.append(username);
		if (password.length())
			authority.append(1, L':').append(password);
		authority.append(1, L'@');
	}
	authority.append(domain);
	if (port.length())
		authority.append(1, L':').append(port);
	return authority;
}

wstring URLTokenizer::getPathWithoutFile() const
{
	size_t pos = path.rfind(L'/');
	if (pos != wstring::npos)
	{
		// pos can't be wstring::npos here
		return path.substr(0, pos + 1);
	}
	else
	{
		return L"/";
	}
}

wstring URLTokenizer::getRelativeURL(const wstring& url) const
{
	URLTokenizer relTokens(url);
	if (relTokens.protocol.length())
	{
		// complete url, return immediately
		// test url: https://addons.mozilla.org/zh-CN/firefox/
		return url;
	}

	if (relTokens.getAuthority().length())
	{
		// same protocol semi-complete url, return immediately
		// test url: http://www.windowsazure.com/zh-cn/
		relTokens.protocol = this->protocol;
		return relTokens.assemble();
	}

	if (startsWithChar(relTokens.path, L'/'))
	{
		// root url
		// test url: https://mail.qq.com/cgi-bin/loginpage?
		relTokens.protocol = this->protocol;
		relTokens.username = this->username;
		relTokens.password = this->password;
		relTokens.domain = this->domain;
		relTokens.port = this->port;
		return relTokens.assemble();
	}
	else
	{
		// relative url
		// test url: http://www.update.microsoft.com/windowsupdate/v6/thanks.aspx?ln=zh-cn&&thankspage=5
		relTokens.protocol = this->protocol;
		relTokens.username = this->username;
		relTokens.password = this->password;
		relTokens.domain = this->domain;
		relTokens.port = this->port;
		relTokens.path = this->getPathWithoutFile() + relTokens.path;
		return relTokens.assemble();
	}
}
