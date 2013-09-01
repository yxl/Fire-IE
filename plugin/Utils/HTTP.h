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

// HTTP.h : HTTP related utilities (header extraction)

#pragma once

namespace Utils { namespace HTTP {

	// Extracts szFieldName field from szHeader, returns the pointer past the found field, or NULL if not found
	// The string (*pFieldValue) must be freed using FreeFieldValue(LPWSTR*)
	LPWSTR ExtractFieldValue(LPCWSTR szHeader, LPCWSTR szFieldName, LPWSTR* pFieldValue, size_t* pSize);

	// Free field value allocated by ExtractFieldValue(...)
	void FreeFieldValue(LPWSTR pFieldValue);

	void HttpRawHeader2CrLfHeader(LPCSTR szRawHeader, CString & strCrLfHeader);
} } // namespace Utils::HTTP
