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

// RegExp.cpp : regular expression matching engine implementation file
//

#include "StdAfx.h"

#include "RegExp.h"
#include "jscre\JSRegExp.h"
#include "strutils.h"

using namespace re;
using namespace jscre;
using namespace std;
using namespace strutils;

static void* (*jscre_malloc)(size_t size) = malloc;
static void (*jscre_free)(void* address) = free;

RegExp::RegExp()
{
	m_strFullPattern = L"//";
	m_bCompiled = false;
	m_re = NULL;
	setAttributes();
}

RegExp::RegExp(const wstring& strFullPattern)
{
	m_strFullPattern = strFullPattern;
	m_bCompiled = false;
	m_re = NULL;
	setAttributes();
	compile();
}

RegExp::RegExp(const RegExp& other)
{
	m_strFullPattern = other.m_strFullPattern;
	m_bIgnoreCase = other.m_bIgnoreCase;
	m_bMultiLine = other.m_bMultiLine;
	m_bGlobal = other.m_bGlobal;
	m_nLastPos = other.m_nLastPos;

	m_re = NULL;
	m_bCompiled = false;
	if (other.m_bCompiled)
		compile();
}

RegExp& RegExp::operator=(const RegExp& other)
{
	if (this == &other) return *this;

	if (m_re) jsRegExpFree(m_re, jscre_free);

	m_strFullPattern = other.m_strFullPattern;
	m_bIgnoreCase = other.m_bIgnoreCase;
	m_bMultiLine = other.m_bMultiLine;
	m_bGlobal = other.m_bGlobal;
	m_nLastPos = other.m_nLastPos;

	m_re = NULL;
	m_bCompiled = false;
	if (other.m_bCompiled)
		compile();

	return *this;
}

RegExp& RegExp::operator=(const wstring& strFullPattern)
{
	compile(strFullPattern);
	return *this;
}

RegExp::~RegExp()
{
	if (m_re) jsRegExpFree(m_re, jscre_free);
}

void RegExp::compile()
{
	if (m_bCompiled) return;

	JSRegExp* re = NULL;
	m_nSubPatterns = 0;
	const char* errorMessage = NULL;

	wstring pattern = getPattern();
	re = jsRegExpCompile((const UChar*)pattern.c_str(), (int)pattern.length(),
		m_bIgnoreCase ? JSRegExpIgnoreCase : JSRegExpDoNotIgnoreCase,
		m_bMultiLine ? JSRegExpMultiline : JSRegExpSingleLine,
		&m_nSubPatterns, &errorMessage, jscre_malloc, jscre_free);

	if (re)
	{
		if (m_re) // in case of a re-compile
		{
			jsRegExpFree(m_re, jscre_free);
		}
		m_re = re;
		m_bCompiled = true;
	}
	else throw RegExpCompileError(errorMessage);
}

void RegExp::compile(const wstring& strFullPattern)
{
	m_strFullPattern = strFullPattern;
	setAttributes();
	m_bCompiled = false;
	compile();
}

void RegExp::compile(const wstring& strFullPattern, const wstring& strAttributes)
{
	m_strFullPattern = strFullPattern;
	setAttributes(strAttributes);
	m_bCompiled = false;
	compile();
}

RegExpMatch* RegExp::exec(const wstring& str)
{
	return exec(str, m_nLastPos);
}

RegExpMatch* RegExp::exec(const wstring& str, int lastPos)
{
	if (!m_bCompiled) compile();
	RegExpMatch* match = execCore(str, lastPos);
	if (m_bGlobal)
	{
		// should record last match position
		if (match)
		{
			int advance = (int)match->substrings[0].length();
			if (advance < 1) advance = 1;
			m_nLastPos = match->index + advance;
		}
		else
			m_nLastPos = 0;
	}
	return match;
}

RegExpMatch* RegExp::exec(const wstring& str) const
{
	return exec(str, m_nLastPos);
}

RegExpMatch* RegExp::exec(const wstring& str, int lastPos) const
{
	if (!m_bCompiled) throw RegExpCompileError("cannot compile in constant function");
	return execCore(str, lastPos);
}

RegExpMatch* RegExp::execCore(const wstring& str, int lastPos) const
{
	int numBackRefs = (int)m_nSubPatterns;
	int offsetLength = (numBackRefs + 1) * 3;
	int* offsets = new int[offsetLength];

	int ret;
	do {
		ret = jsRegExpExecute(m_re, (const UChar*)str.c_str(), (int)str.length(), lastPos, offsets, offsetLength);
		if (ret < 0) // Error or no match
		{
			delete [] offsets;
			return NULL;
		}
		if (ret == 0) // offsets overflow, re-allocate the array and run again
		{
			delete [] offsets;
			offsetLength *= 2;
			offsets = new int[offsetLength];
		}
	} while (ret == 0);

	numBackRefs = ret - 1;

	// Matches
	RegExpMatch* match = new RegExpMatch();
	match->index = offsets[0];
	match->input = str;
	match->substrings.reserve(m_nSubPatterns + 1);
	match->substrings.push_back(str.substr(offsets[0], offsets[1] - offsets[0]));
	for (int i = 1; i <= numBackRefs; i++)
	{
		int l = offsets[i * 2], r = offsets[i * 2 + 1];
		if (l >= 0 && r >= l && r <= (int)str.length())
			match->substrings.push_back(str.substr(l, r - l));
		else match->substrings.push_back(L"");
	}
	for (int i = numBackRefs + 1; i <= (int)m_nSubPatterns; i++)
	{
		match->substrings.push_back(L"");
	}
	delete [] offsets;
	return match;
}

bool RegExp::test(const wstring& str)
{
	if (!m_bCompiled) compile();
	return testCore(str);
}

bool RegExp::test(const wstring& str) const
{
	if (!m_bCompiled) throw RegExpCompileError("cannot compile in constant function");
	return testCore(str);
}

bool RegExp::testCore(const wstring& str) const
{
	return 0 <= jsRegExpExecute(m_re, (const UChar*)str.c_str(), (int)str.length(), 0, NULL, 0);
}

void RegExp::setAttributes()
{
	size_t idx = m_strFullPattern.rfind(L'/');
	wstring strAttributes;
	if (idx != wstring::npos)
		strAttributes = m_strFullPattern.substr(idx + 1);
	setAttributes(strAttributes);
}

void RegExp::setAttributes(const wstring& strAttributes)
{
	m_nLastPos = 0;
	m_bIgnoreCase = false;
	m_bMultiLine = false;
	m_bGlobal = false;
	for (size_t idx = 0; idx < strAttributes.length(); idx++)
	{
		wchar_t ch = strAttributes[idx];
		if (ch == L'i') m_bIgnoreCase = true;
		if (ch == L'm') m_bMultiLine = true;
		if (ch == L'g') m_bGlobal = true;
	}
}

wstring RegExp::getPattern() const
{
	if (!startsWithChar(m_strFullPattern, L'/'))
		return m_strFullPattern;
	size_t idxStart = 1;
	size_t idxEnd = m_strFullPattern.rfind(L'/');
	if (idxEnd == wstring::npos || idxEnd <= idxStart) return L"";
	return m_strFullPattern.substr(idxStart, idxEnd - idxStart);
}
