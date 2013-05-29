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

// RegExp.h : regular expression matching engine
//

#include <string>
#include <vector>
#include <stdexcept>

namespace jscre {
	struct JSRegExp;
}

namespace re {

struct RegExpMatch {
	int index;
	std::wstring input;
	std::vector<std::wstring> substrings;
};

class RegExp {
public:
	RegExp();
	RegExp(const std::wstring& strFullPattern);
	RegExp(const RegExp&);
	~RegExp();

	RegExp& operator=(const RegExp&);
	RegExp& operator=(const std::wstring& strFullPattern);

	// Compiles the regular expression
	void compile();
	void compile(const std::wstring& strFullPattern);
	void compile(const std::wstring& strFullPattern, const std::wstring& attributes);

	bool isGlobal() const { return m_bGlobal; }
	bool ifIgnoreCase() const { return m_bIgnoreCase; }
	bool isMultiLine() const { return m_bMultiLine; }
	int getLastIndex() const { return m_nLastPos; }
	std::wstring getSource() const { return m_strFullPattern; }

	// do regexp matching, caller is responsible to free RegExpMatch*
	bool exec(RegExpMatch& match, const std::wstring& str);
	bool exec(RegExpMatch& match, const std::wstring& str, int lastPos);
	// should use const version in multi-threading environment
	bool exec(RegExpMatch& match, const std::wstring& str) const; 
	bool exec(RegExpMatch& match, const std::wstring& str, int lastPos) const;
	// do regexp testing
	bool test(const std::wstring& str);
	bool test(const std::wstring& str) const; // should use const version in multi-threading environment
private:
	// the compiled regular expression
	jscre::JSRegExp* m_re;

	// pattern with attributes
	std::wstring m_strFullPattern;
	bool m_bIgnoreCase;
	bool m_bMultiLine;
	bool m_bGlobal;

	// lazy compile
	bool m_bCompiled;

	// last position, for global RegExp's
	int m_nLastPos;
	// number of sub patterns, from compiled info
	unsigned int m_nSubPatterns;
private:
	std::wstring getPattern() const;
	void setAttributes();
	void setAttributes(const std::wstring& strAttributes);

	bool execCore(RegExpMatch& match, const std::wstring& str, int lastPos) const;
	bool testCore(const std::wstring& str) const;
};

class RegExpCompileError : public std::runtime_error {
public:
	RegExpCompileError(const char* what) : std::runtime_error(what) {}
};

} // namespace re
