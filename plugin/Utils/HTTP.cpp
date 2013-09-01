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

// HTTP.cpp : HTTP related utilities (header extraction)

#include "StdAfx.h"

#include "HTTP.h"

using namespace Utils;

// 把以 \0 分隔的 Raw HTTP Header 数据转换成以 \r\n 分隔的 Header
void HTTP::HttpRawHeader2CrLfHeader(LPCSTR szRawHeader, CString & strCrLfHeader)
{
	strCrLfHeader.Empty();

	LPCSTR p = szRawHeader;
	while ( p[0] )
	{
		CString strHeaderLine(p);

		p += strHeaderLine.GetLength() + 1;

		strCrLfHeader += strHeaderLine + _T("\r\n");
	}
}

LPWSTR HTTP::ExtractFieldValue(LPCWSTR szHeader, LPCWSTR szFieldName, LPWSTR * pFieldValue, size_t * pSize )
{
	LPWSTR r = NULL;

	do 
	{
		// 根据 RFC2616 规定, HTTP field name 不区分大小写
		LPWSTR pStart = StrStrIW( szHeader, szFieldName );
		if ( ! pStart ) break;
		pStart += wcslen(szFieldName);
		while ( L' ' == pStart[0] ) pStart++;		// 跳过开头的空格
		LPWSTR pEnd = StrStrW( pStart, L"\r\n" );
		if ( ( ! pEnd ) || ( pEnd <= pStart ) ) break;

		size_t nSize = pEnd - pStart;
		size_t nBufLen = nSize + 2;		// 留给字符串的 0 结束符
		LPWSTR lpBuffer = (LPWSTR)malloc(nBufLen * sizeof(WCHAR));
		if ( !lpBuffer ) break;

		if (wcsncpy_s( lpBuffer, nBufLen, pStart, nSize))
		{
			free(lpBuffer);
			break;
		}

		* pSize = nBufLen;
		* pFieldValue = lpBuffer;
		r = pEnd;

	} while(false);

	return r;
}

void HTTP::FreeFieldValue(LPWSTR szFieldValue)
{
	free(szFieldValue);
}
