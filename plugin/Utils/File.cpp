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

// File.cpp : file reading utilities
//

#include "StdAfx.h"

#include "File.h"

using namespace Utils;

// do not process files larger than 20MB
const ULONGLONG File::FILE_SIZE_LIMIT = 20 * (1 << 20);

bool File::readFile(CFile& file, wstring& content)
try
{
	// File encoding signatures
	static const WORD SIG_UNICODE = 0xFEFF; // Unicode (little endian)
	static const WORD SIG_UNICODE_BIG_ENDIAN = 0xFFFE; // Unicode big endian
	static const DWORD SIG_UTF8 = 0xBFBBEF; /*EF BB BF*/ // UTF-8

	// Read the signature from file
	WORD signature = 0;
	if (file.GetLength() >= 2)
	{
		file.Read(&signature, 2);
		file.SeekToBegin();
	}
	// Use different ways to open files with different encodings
	bool success = false;
	if (signature == SIG_UNICODE)
		success = readUnicode(file, content);
	else if (signature == SIG_UNICODE_BIG_ENDIAN)
		success = readUnicodeBigEndian(file, content);
	else if(signature == (SIG_UTF8 & 0xffff))
	{
		if (file.GetLength() >= 3) {
			DWORD sig = 0;
			file.Read(&sig, 3);
			file.SeekToBegin();
			if (sig == SIG_UTF8)
				success = readUTF8(file, content);
			else
			{
				success = readUTF8OrANSI(file, content);
			}
		} else success = readUTF8OrANSI(file, content);
	}
	else 
		success = readUTF8OrANSI(file, content);
	
	return success;
}
catch (...)
{
	TRACE(L"Failed to read the file.\n");
	return false;
}

bool File::readUTF8OrANSI(CFile& file, wstring& content)
{
	// try twice, first with UTF8, then fallback to ANSI
	bool success = readUTF8(file, content, false);
	if (!success)
	{
		file.SeekToBegin();
		success = readANSI(file, content);
	}
	return success;
}

bool File::readANSI(CFile& file, wstring& content)
{
	ULONGLONG contentLength = file.GetLength();
	// Do not process files larger than 10MB
	if (contentLength == 0)
	{
		content = L"";
		return true;
	}
	if (contentLength > FILE_SIZE_LIMIT)
		contentLength = FILE_SIZE_LIMIT;
	char* buffer = new char[(size_t)contentLength];
	file.Read(buffer, (unsigned int)contentLength);

	// We need a code page convertion here
	// Calculate the size of buffer needed
	int newContentLength = MultiByteToWideChar(CP_ACP, 0, 
		buffer, (int)contentLength, NULL, 0);
	if (!newContentLength)
	{
		delete[] buffer;
		return false;
	}
	content.resize(newContentLength);

	// Real convertion
	int size = MultiByteToWideChar(CP_ACP, 0, 
		buffer, (int)contentLength, &content[0], newContentLength);
	delete[] buffer;
	return 0 != size;
}

bool File::readUTF8(CFile& file, wstring& content, bool skipBOM)
{
	ULONGLONG contentLength = (file.GetLength() - (skipBOM ? 3 : 0));
	if (contentLength <= 0)
	{
		content = L"";
		return true;
	}
	if (contentLength > FILE_SIZE_LIMIT)
		contentLength = FILE_SIZE_LIMIT;
	if (skipBOM) file.Seek(3, CFile::begin);

	char* buffer = new char[(size_t)contentLength];
	file.Read(buffer, (unsigned int)contentLength);

	// We need a code page convertion here
	// Calculate the size of buffer needed
	int newContentLength = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, 
		buffer, (int)contentLength, NULL, 0);
	if (!newContentLength)
	{
		delete[] buffer;
		return false;
	}
	content.resize(newContentLength);

	// Real convertion
	int size = MultiByteToWideChar(CP_UTF8, 0, 
		buffer, (int)contentLength, &content[0], newContentLength);
	delete[] buffer;
	return 0 != size;
}

bool File::readUnicode(CFile& file, wstring& content)
{
	ASSERT(sizeof(wchar_t) == 2); // required by UTF16

	ULONGLONG contentLength = (file.GetLength() - 2) / sizeof(wchar_t);
	if (contentLength <= 0)
	{
		content = L"";
		return true;
	}
	if (contentLength > FILE_SIZE_LIMIT)
		contentLength = FILE_SIZE_LIMIT;
	content.resize((size_t)contentLength);
	file.Seek(2, CFile::begin);

	// Directly put the contents into the wstring
	file.Read(&content[0], (unsigned int)(contentLength * sizeof(wchar_t)));
	
	return true;
}

bool File::readUnicodeBigEndian(CFile& file, wstring& content)
{
	ASSERT(sizeof(wchar_t) == 2); // required by UTF16

	ULONGLONG contentLength = (file.GetLength() - 2) / sizeof(wchar_t);
	if (contentLength <= 0)
	{
		content = L"";
		return true;
	}
	if (contentLength > FILE_SIZE_LIMIT)
		contentLength = FILE_SIZE_LIMIT;
	content.resize((size_t)contentLength);
	file.Seek(2, CFile::begin);

	// Directly put the contents into the wstring
	file.Read(&content[0], (unsigned int)(contentLength * sizeof(wchar_t)));

	// reverse the bytes in each character
	for (int i = 0; i < (int)contentLength; i++) {
		unsigned int ch = content[i];
		content[i] = (wchar_t)((ch >> 8) | (ch << 8));
	}

	return true;
}
