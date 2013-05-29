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

// URL.h : URL utilities
//

namespace re {
	class RegExp;
}

namespace Utils {
	CString GetHostFromUrl(const CString& strUrl);
	CString GetProtocolFromUrl(const CString& strUrl);
	CString GetPathFromUrl(const CString& strUrl);
	CString GetURLRelative(const CString& baseURL, const CString& relativeURL);
	bool IsThirdPartyRequest(const CString& request, const CString& referer);
	bool IsSubDomain(const CString& subdomain, const CString& domain);

	// URL tokenizer, using w3c recommended tokenizing style
	// See http://www.ietf.org/rfc/rfc2396.txt
	class URLTokenizer {
	public:
		std::wstring protocol;
		std::wstring username;
		std::wstring password;
		std::wstring domain;
		std::wstring port;
		std::wstring path;
		std::wstring query;
		std::wstring anchor;

		URLTokenizer() {}
		URLTokenizer(const std::wstring& url) { tokenize(url); }
		bool tokenize(const std::wstring& url);
		// put tokens together to form a URL
		std::wstring assemble() const;
		// get authority part of the url (username:password@domain:port)
		std::wstring getAuthority() const;
		// get the path part without file name
		std::wstring getPathWithoutFile() const;

		std::wstring getRelativeURL(const std::wstring& url) const;
	private:
		static const re::RegExp tokenizerRegExp;
	};
} // namespace Utils
