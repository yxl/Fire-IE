#include "stdafx.h"
#include "URI.h"


namespace Utility
{
	URI::URI()
		:_port(0)
	{
	}


	URI::URI(const CString& uri)
		:_port(0)
	{
		parse(uri);
	}


	URI::URI(const TCHAR* uri)
		:_port(0)
	{
		parse(uri);
	}


	URI::URI(const URI& uri)
		:_scheme(uri._scheme),
		_userInfo(uri._userInfo),
		_host(uri._host),
		_port(uri._port),
		_path(uri._path),
		_query(uri._query),
		_fragment(uri._fragment)
	{
	}


	URI::~URI()
	{
	}


	URI& URI::operator = (const URI& uri)
	{
		if (&uri != this)
		{
			_scheme   = uri._scheme;
			_userInfo = uri._userInfo;
			_host     = uri._host;
			_port     = uri._port;
			_path     = uri._path;
			_query    = uri._query;
			_fragment = uri._fragment;
		}
		return *this;
	}


	URI& URI::operator = (const CString& uri)
	{
		clear();
		parse(uri);
		return *this;
	}


	URI& URI::operator = (const char* uri)
	{
		clear();
		parse(CString(uri));
		return *this;
	}

	void URI::clear()
	{
		_scheme.Empty();
		_userInfo.Empty();
		_host.Empty();
		_port = 0;
		_path.Empty();
		_query.Empty();
		_fragment.Empty();
	}


	CString URI::toString() const
	{
		CString uri;
		uri = _scheme;
		uri += _T("://");
		if (!_userInfo.IsEmpty())
		{
			uri += _userInfo;
			uri += _T("@");
		}
		uri += _host;
		if (!isWellKnownPort())
		{
			CString tmp;
			tmp.Format(_T(":%d"), _port);
			uri += tmp;
		}
		uri += encode(_path);
		if (!_query.IsEmpty())
		{
			uri += _T('?');
			CString query = encode(_query);
			query.Replace(_T("%26"), _T("&"));
			uri += query;
		}
		if (!_fragment.IsEmpty())
		{
			uri += _T('#');
			uri += encode(_fragment);
		}
		return uri;
	}


	void URI::setScheme(const CString& scheme)
	{
		_scheme = scheme;
		_scheme.MakeLower();
		if (_port == 0)
			_port = getWellKnownPort();
	}


	void URI::setUserInfo(const CString& userInfo)
	{
		_userInfo.Empty();
		_userInfo = decode(userInfo);
	}


	void URI::setHost(const CString& host)
	{
		_host = host;
	}


	unsigned short URI::getPort() const
	{
		if (_port == 0)
			return getWellKnownPort();
		else
			return _port;
	}


	void URI::setPort(unsigned short port)
	{
		_port = port;
	}

	void URI::setPath(const CString& path)
	{
		_path = decode(path);
		if (_path[0] != _T('/'))
		{
			_path = _T("/") + _path;
		}
	}


	void URI::setRawQuery(const CString& query)
	{
		_query = query;
	}


	void URI::setQuery(const CString& query)
	{
		_query = encode(query);
		_query.Replace(_T("%26"), _T("&"));
	}


	CString URI::getQuery() const
	{
		CString query;
		query = decode(_query);
		return query;
	}


	void URI::setFragment(const CString& fragment)
	{
		_fragment = decode(fragment);
	}

	bool URI::empty() const
	{
		return _scheme.IsEmpty() && _host.IsEmpty() && _path.IsEmpty() && _query.IsEmpty() && _fragment.IsEmpty();
	}


	bool URI::operator == (const URI& uri) const
	{
		return equals(uri);
	}


	bool URI::operator == (const CString& uri) const
	{
		URI parsedURI(uri);
		return equals(parsedURI);
	}


	bool URI::operator != (const URI& uri) const
	{
		return !equals(uri);
	}


	bool URI::operator != (const CString& uri) const
	{
		URI parsedURI(uri);
		return !equals(parsedURI);
	}


	bool URI::equals(const URI& uri) const
	{
		return _scheme   == uri._scheme
			&& _userInfo == uri._userInfo
			&& _host     == uri._host
			&& getPort() == uri.getPort()
			&& _path     == uri._path
			&& _query    == uri._query
			&& _fragment == uri._fragment;
	}


	CString URI::encode(const CString& str)
	{
		CString encodedStr;
		CString szBuffer;
		DWORD dwSize = INTERNET_MAX_URL_LENGTH;
		if (SUCCEEDED(UrlEscape(str, szBuffer.GetBuffer(INTERNET_MAX_URL_LENGTH), &dwSize, 0)))
		{
			encodedStr = szBuffer;
		}
		szBuffer.ReleaseBuffer();
		return encodedStr;
	}


	CString URI::decode(const CString& str)
	{
		CString decodedStr;
		TCHAR szURL[INTERNET_MAX_URL_LENGTH];
		_tcscpy_s(szURL, str);
		DWORD dwSize = INTERNET_MAX_URL_LENGTH;
		CString escaped;
		if (SUCCEEDED(UrlUnescape(szURL, escaped.GetBuffer(INTERNET_MAX_URL_LENGTH), &dwSize, 0)))
		{
			decodedStr = escaped;
		}
		escaped.ReleaseBuffer();
		return decodedStr;
	}


	bool URI::isWellKnownPort() const
	{
		return _port == getWellKnownPort();
	}


	unsigned short URI::getWellKnownPort() const
	{
		if (_scheme == _T("ftp"))
			return 21;
		else if (_scheme == _T("ssh"))
			return 22;
		else if (_scheme == _T("telnet"))
			return 23;
		else if (_scheme == _T("http"))
			return 80;
		else if (_scheme == _T("nntp"))
			return 119;
		else if (_scheme == _T("ldap"))
			return 389;
		else if (_scheme == _T("https"))
			return 443;
		else if (_scheme == _T("rtsp"))
			return 554;
		else if (_scheme == _T("sip"))
			return 5060;
		else if (_scheme == _T("sips"))
			return 5061;
		else if (_scheme == _T("xmpp"))
			return 5222;
		else
			return 0;
	}


	// foo://username:password@example.com:8042/over/there/index.dtb?type=animal&name=narwhal#nose
	void URI::parse(const CString& uri)
	{
		CString strData = uri;
		strData.Trim();

		if (strData.GetLength() == 0) return;

		// deal with file:///C:/a/b
		CString fileScheme = _T("file:///");
		if (strData.Left(fileScheme.GetLength()) == fileScheme)
		{
			setScheme(_T("file"));
			setPath(strData.Mid(fileScheme.GetLength()));
			return;
		}

		// parse scheme
		int pos = strData.Find(_T("://"));
		CString scheme;
		if (pos != -1)
		{
			scheme = strData.Left(pos);
			setScheme(scheme);
			strData = strData.Mid(pos + 3);
		}
		else
		{
			setScheme(_T("http"));
		}

		// parse user info
		pos = strData.Find(_T('@'));
		CString userInfo;
		if (pos != -1)
		{
			userInfo = strData.Left(pos).Trim();
			setUserInfo(userInfo);
			strData = strData.Mid(pos + 1);
		}

		int posPortBegin = strData.Find(_T(':'));
		int posPortEnd = strData.Find(_T('/'));
		int posQuery = strData.Find(_T('?'));
		int posFragment = strData.Find(_T('#'));	
		if (posFragment == -1)
		{
			posFragment = strData.GetLength();
		}
		if (posQuery == -1)
		{
			posQuery = posFragment;
		}
		if (posPortEnd == -1)
		{
			posPortEnd = posQuery;
		}
		if (posPortBegin == -1)
		{
			posPortBegin = posPortEnd;
		}

		// parse host name
		CString host = strData.Left(posPortBegin);
		CString end = host.Right(1); 
		if (end == _T(":") || end == _T("/"))
		{
			host = host.Left(host.GetLength() - 1);
		}
		setHost(host);

		// parse port

		if (posPortBegin + 1 < posPortEnd)
		{
			int port = 0;
			if (!strData.IsEmpty())
			{
				port = _ttoi(strData.Mid(posPortBegin + 1, posPortEnd - posPortBegin - 1));
			}
			setPort(port);
		}

		// parse path
		CString path;
		if (posPortEnd < strData.GetLength() && posPortEnd < posQuery - 1)
		{
			path = strData.Mid(posPortEnd, posQuery - posPortEnd - 1);
		}
		setPath(path);

		// parse query
		CString query;
		if (posFragment - posQuery > 1)
		{
			query = strData.Mid(posQuery + 1, posFragment - posQuery -1);
		}
		setQuery(query);

		// parse fragment
		CString fragment;
		if (posFragment + 1 < strData.GetLength())
		{
			fragment = strData.Mid(posFragment + 1);

		}
		setFragment(fragment);
	}

} // namespace Utility
