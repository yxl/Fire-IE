#pragma once

#include <vector>


namespace Utility 
{

	class URI
		/// A Uniform Resource Identifier, as specified in RFC 3986.
		/// 
		/// The URI class provides methods for building URIs from their
		/// parts, as well as for splitting URIs into their parts.
		/// Furthermore, the class provides methods for resolving
		/// relative URIs against base URIs.
		///
		/// The class automatically performs a few normalizations on
		/// all URIs and URI parts passed to it:
		///   * scheme identifiers are converted to lower case.
		///   * percent-encoded characters are decoded
		///   * optionally, dot segments are removed from paths (see normalize())
	{
	public:
		URI();
		/// Creates an empty URI.

		explicit URI(const CString& uri);
		/// Parses an URI from the given string. Throws a
		/// SyntaxException if the uri is not valid.

		explicit URI(const TCHAR* uri);
		/// Parses an URI from the given string. Throws a
		/// SyntaxException if the uri is not valid.

		URI(const URI& uri);
		/// Copy constructor. Creates an URI from another one.

		~URI();
		/// Destroys the URI.

		URI& operator = (const URI& uri);
		/// Assignment operator.

		URI& operator = (const CString& uri);
		/// Parses and assigns an URI from the given string. Throws a
		/// SyntaxException if the uri is not valid.

		URI& operator = (const char* uri);
		/// Parses and assigns an URI from the given string. Throws a
		/// SyntaxException if the uri is not valid.

		void clear();
		/// Clears all parts of the URI.

		CString toString() const;
		/// Returns a string representation of the URI.
		///
		/// Characters in the path, query and fragment parts will be 
		/// percent-encoded as necessary.

		const CString& getScheme() const;
		/// Returns the scheme part of the URI.

		void setScheme(const CString& scheme);
		/// Sets the scheme part of the URI. The given scheme
		/// is converted to lower-case.
		///
		/// A list of registered URI schemes can be found
		/// at <http://www.iana.org/assignments/uri-schemes>.

		const CString& getUserInfo() const;
		/// Returns the user-info part of the URI.

		void setUserInfo(const CString& userInfo);
		/// Sets the user-info part of the URI.

		const CString& getHost() const;
		/// Returns the host part of the URI.

		void setHost(const CString& host);
		/// Sets the host part of the URI.

		unsigned short getPort() const;
		/// Returns the port number part of the URI.
		///
		/// If no port number (0) has been specified, the
		/// well-known port number (e.g., 80 for http) for
		/// the given scheme is returned if it is known.
		/// Otherwise, 0 is returned.

		void setPort(unsigned short port);
		/// Sets the port number part of the URI.

		CString getAuthority() const;
		/// Returns the authority part (userInfo, host and port)
		/// of the URI. 
		///
		/// If the port number is a well-known port
		/// number for the given scheme (e.g., 80 for http), it
		/// is not included in the authority.

		void setAuthority(const CString& authority);
		/// Parses the given authority part for the URI and sets
		/// the user-info, host, port components accordingly.

		const CString& getPath() const;
		/// Returns the path part of the URI.

		void setPath(const CString& path);
		/// Sets the path part of the URI.

		CString getQuery() const;
		/// Returns the query part of the URI.

		void setQuery(const CString& query);	
		/// Sets the query part of the URI.

		const CString& getRawQuery() const;
		/// Returns the unencoded query part of the URI.

		void setRawQuery(const CString& query);	
		/// Sets the query part of the URI.

		const CString& getFragment() const;
		/// Returns the fragment part of the URI.

		void setFragment(const CString& fragment);
		/// Sets the fragment part of the URI.

		void setPathEtc(const CString& pathEtc);
		/// Sets the path, query and fragment parts of the URI.

		CString getPathEtc() const;
		/// Returns the path, query and fragment parts of the URI.

		CString getPathAndQuery() const;
		/// Returns the path and query parts of the URI.	

		void resolve(const CString& relativeURI);
		/// Resolves the given relative URI against the base URI.
		/// See section 5.2 of RFC 3986 for the algorithm used.

		void resolve(const URI& relativeURI);
		/// Resolves the given relative URI against the base URI.
		/// See section 5.2 of RFC 3986 for the algorithm used.

		bool empty() const;
		/// Returns true if the URI is empty, false otherwise.

		bool operator == (const URI& uri) const;
		/// Returns true if both URIs are identical, false otherwise.
		///
		/// Two URIs are identical if their scheme, authority,
		/// path, query and fragment part are identical.

		bool operator == (const CString& uri) const;
		/// Parses the given URI and returns true if both URIs are identical,
		/// false otherwise.

		bool operator != (const URI& uri) const;
		/// Returns true if both URIs are identical, false otherwise.

		bool operator != (const CString& uri) const;
		/// Parses the given URI and returns true if both URIs are identical,
		/// false otherwise.

		static CString encode(const CString& str);
		/// URI-encodes the given string by escaping reserved and non-ASCII
		/// characters. The encoded string is appended to encodedStr.

		static CString decode(const CString& str);
		/// URI-decodes the given string by replacing percent-encoded
		/// characters with the actual character. The decoded string
		/// is appended to decodedStr.

	protected:
		bool equals(const URI& uri) const;
		/// Returns true if both uri's are equivalent.

		bool isWellKnownPort() const;
		/// Returns true if the URI's port number is a well-known one
		/// (for example, 80, if the scheme is http).

		unsigned short getWellKnownPort() const;
		/// Returns the well-known port number for the URI's scheme,
		/// or 0 if the port number is not known.

		void parse(const CString& uri);
		/// Parses and assigns an URI from the given string. Throws a
		/// SyntaxException if the uri is not valid.	
	private:
		CString _scheme;
		CString _userInfo;
		CString _host;
		int _port;
		CString _path;
		CString _query;
		CString _fragment;
	};


	//
	// inlines
	//
	inline const CString& URI::getScheme() const
	{
		return _scheme;
	}


	inline const CString& URI::getUserInfo() const
	{
		return _userInfo;
	}


	inline const CString& URI::getHost() const
	{
		return _host;
	}


	inline const CString& URI::getPath() const
	{
		return _path;
	}


	inline const CString& URI::getRawQuery() const
	{
		return _query;
	}


	inline const CString& URI::getFragment() const
	{
		return _fragment;
	}

} // namespace Utility
