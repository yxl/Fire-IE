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

// strutils.cpp : wstring utilities
//

#include "StdAfx.h"

#include "RegExp.h"

namespace re { namespace strutils {

// See https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/String/replace#Specifying_a_string_as_a_parameter
// Some tricky test cases:
// "abcdefghijklmn".replace(/(a)(b)(c)(d)(e)(f)(g)(h)(i)(j)(k)(l)(m)(n)/, "$001"): "$001"
// "abcdefghijklmn".replace(/(a)(b)(c)(d)(e)(f)(g)(h)(i)(j)(k)(l)(m)(n)/, "$01"): "a"
// "abcdefghijklmn".replace(/(a)(b)(c)(d)(e)(f)(g)(h)(i)(j)(k)(l)(m)(n)/, "$10"): "j"
// "abcdefghijklmn".replace(/(a)(b)(c)(d)(e)(f)(g)(h)(i)(j)(k)(l)(m)(n)/, "$15"): "a5"
// "abcdefghijklmn".replace(/(a)(b)(c)(d)(e)(f)(g)(h)(i)(j)(k)(l)(m)(n)/, "$20"): "b0"
void insertReplacedString(wstring& builder, const wstring& base, const wstring& str, const RegExpMatch& match)
{
	const vector<wstring>& substrings = match.substrings;
	const wstring& mstr = substrings[0];
	for (size_t i = 0; i < str.length(); i++)
	{
		if (str[i] == L'$' && str.length() > i + 1)
		{
			wchar_t ch = str[++i];
			switch (ch)
			{
			case L'$': // insert a '$'
				builder.push_back(ch);
				break;
			case L'&': // insert the matched string
				builder.append(mstr);
				break;
			case L'`': // insert the portion preceding the matched string
				builder.append(base.begin(), base.begin() + match.index);
				break;
			case L'\'': // insert the portion following the matched string
				builder.append(base.begin() + match.index + mstr.length(), base.end());
				break;
			default:
				if (ch >= L'0' && ch <= L'9')
				{
					int expidx = 0;
					wchar_t ch2 = str.length() > i + 1 ? str[i + 1] : L'\0';
					if (ch2 >= L'0' && ch2 <= L'9')
					{
						expidx = ch2 - L'0' + 10 * (ch - L'0');
						// if expidx overflows, fall back to single-digit
						if (expidx == 0 || expidx >= (int)substrings.size())
						{
							expidx = ch - L'0';
							ch2 = 0;
						}
					}
					else
					{
						ch2 = 0;
						expidx = ch - L'0';
					}
					// substrings.size() is 1 bigger than actual sub matches
					if (expidx < (int)substrings.size() && expidx > 0)
					{
						const wstring& submstr = substrings[expidx];
						builder.append(submstr);
						if (ch2) ++i;
						break;
					}
				}
				// $ escape fails, output as is
				builder.push_back(L'$');
				builder.push_back(ch);
			}
		}
		else builder.push_back(str[i]);
	}
}

wstring replace(const wstring& base, const RegExp& re, const wstring& str)
{
	std::vector<RegExpMatch> matches;
	RegExpMatch match;
	bool ret;
	if (re.isGlobal())
	{
		ret = re.exec(match, base, 0);
		while (ret)
		{
			matches.push_back(match);
			int advance = (int)match.substrings[0].length();
			if (advance < 1) advance = 1;
			ret = re.exec(match, base, match.index + advance);
		}
	}
	else
	{
		ret = re.exec(match, base);
		if (ret) matches.push_back(match);
	}

	// do the replace
	wstring builder;
	size_t lastPos = 0;
	for (size_t i = 0; i < matches.size(); i++)
	{
		RegExpMatch& match = matches[i];
		builder.append(base.begin() + lastPos, base.begin() + match.index);
		insertReplacedString(builder, base, str, match);
		lastPos = match.index + match.substrings[0].length();
	}
	builder.append(base.begin() + lastPos, base.end());

	return builder;
}

vector<wstring> split(const wstring& base, const wstring& separator)
{
	if (!base.length()) return vector<wstring>();

	std::vector<wstring> res;
	size_t idx = 0;
	while (true)
	{
		size_t pos = base.find(separator, idx);
		if (pos == wstring::npos) break;
		res.push_back(base.substr(idx, pos - idx));
		idx = pos + separator.length();
	}
	res.push_back(base.substr(idx, base.length() - idx));
	return res;
}

wstring toUpperCase(wstring str)
{
	if (str.length())
		_wcsupr_s(&str[0], str.length() + 1);
	return str;
}

wstring toLowerCase(wstring str)
{
	if (str.length())
		_wcslwr_s(&str[0], str.length() + 1);
	return str;
}

//RegExpMatch* match(const wstring& base, const RegExp& re)
bool match(RegExpMatch& match, const std::wstring& base, const RegExp& re)
{
	if (!re.isGlobal()) return re.exec(match, base);

	match.index = 0;

	RegExpMatch tmp;
	bool ret = re.exec(tmp, base, 0);
	while (ret)
	{
		match.substrings.push_back(tmp.substrings[0]);
		int advance = (int)tmp.substrings[0].length();
		if (advance < 1) advance = 1;
		int lastPos = tmp.index + advance;
		ret = re.exec(tmp, base, lastPos);
	}

	return true;
}

} } // namespace re::strutils
