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

#include "StdAfx.h"

#ifdef DEBUG

#include "test.h"
#include "re/strutils.h"
#include "re/RegExp.h"
#include "Utils/TLD.h"

using namespace std;
using namespace re;
using namespace re::strutils;
using namespace Utils;

namespace test {
	void testReplace()
	{
		ASSERT(replace(L"abcdefghijklmn", wstring(L"/./"), L"*") == L"*bcdefghijklmn");
		ASSERT(replace(L"abcdefghijklmn", wstring(L"/./g"), L"*") == L"**************");
		ASSERT(replace(L"abcdefghijklmn", wstring(L"/[b-dk-m]/g"), L"*") == L"a***efghij***n");
		ASSERT(replace(L"abcdefghijklmn", wstring(L"/nomatch/g"), L"*") == L"abcdefghijklmn");

		ASSERT(replace(L"abcdefghijklmn", wstring(L"/(b)(c)(d)(e)(f)(g)(h)(i)(j)(k)(l)(m)/"), L"$001") == L"a$001n");
		ASSERT(replace(L"abcdefghijklmn", wstring(L"/(b)(c)(d)(e)(f)(g)(h)(i)(j)(k)(l)(m)/"), L"$01") == L"abn");
		ASSERT(replace(L"abcdefghijklmn", wstring(L"/(b)(c)(d)(e)(f)(g)(h)(i)(j)(k)(l)(m)/"), L"$10") == L"akn");
		ASSERT(replace(L"abcdefghijklmn", wstring(L"/(b)(c)(d)(e)(f)(g)(h)(i)(j)(k)(l)(m)/"), L"$15") == L"ab5n");
		ASSERT(replace(L"abcdefghijklmn", wstring(L"/(b)(c)(d)(e)(f)(g)(h)(i)(j)(k)(l)(m)/"), L"$20") == L"ac0n");
		ASSERT(replace(L"abcdefghijklmn", wstring(L"/(b)(c)(d)(e)(f)(g)(h)(i)(j)(k)(l)(m)/"), L"$") == L"a$n");
		ASSERT(replace(L"abcdefghijklmn", wstring(L"/(b)(c)(d)(e)(f)(g)(h)(i)(j)(k)(l)(m)/"), L"$&") == L"abcdefghijklmn");
		ASSERT(replace(L"abcdefghijklmn", wstring(L"/(b)(c)(d)(e)(f)(g)(h)(i)(j)(k)(l)(m)/"), L"$`") == L"aan");
		ASSERT(replace(L"abcdefghijklmn", wstring(L"/(b)(c)(d)(e)(f)(g)(h)(i)(j)(k)(l)(m)/"), L"$'") == L"ann");
		ASSERT(replace(L"abcdefghijklmn", wstring(L"/(b)(c)(d)(e)(f)(g)(h)(i)(j)(k)(l)(m)/"), L"$$'") == L"a$'n");
	}

	void testTLD()
	{
		ASSERT(TLD::getEffectiveDomain(_T("")) == _T(""));
		ASSERT(TLD::getEffectiveDomain(_T("addons.mozilla.org")) == _T("mozilla.org"));
		ASSERT(TLD::getEffectiveDomain(_T("www.com.cn")) == _T("www.com.cn"));
		ASSERT(TLD::getEffectiveDomain(_T("a.b.c.idontknow")) == _T("a.b.c.idontknow"));
		ASSERT(TLD::getEffectiveDomain(_T("localhost")) == _T("localhost"));
		ASSERT(TLD::getEffectiveDomain(_T("www.sjtu.ed.cn")) == _T("ed.cn"));
		ASSERT(TLD::getEffectiveDomain(_T("www.sjtu.edu.cn")) == _T("sjtu.edu.cn"));
		ASSERT(TLD::getEffectiveDomain(_T("www.sina.com.cn")) == _T("sina.com.cn"));
		ASSERT(TLD::getEffectiveDomain(_T("co.uk")) == _T("co.uk"));
		ASSERT(TLD::getEffectiveDomain(_T("bn.sjtu.info")) == _T("sjtu.info"));
		ASSERT(TLD::getEffectiveDomain(_T("图书馆.上海交通大学.中国")) == _T("上海交通大学.中国"));
		ASSERT(TLD::getEffectiveDomain(_T("www.lib.sjtu.edu.cn")) == _T("sjtu.edu.cn"));
		ASSERT(TLD::getEffectiveDomain(_T("www.lib.sjtu.edu.cn.www.lib.sjtu.edu.cn.www.lib.sjtu.edu.cn")) == _T("sjtu.edu.cn"));
		ASSERT(TLD::getEffectiveDomain(_T("a.b.c.d.e.f.g.h.i.j.k.l.m.n")) == _T("a.b.c.d.e.f.g.h.i.j.k.l.m.n"));
		ASSERT(TLD::getEffectiveDomain(_T("..........")) == _T(".........."));
		ASSERT(TLD::getEffectiveDomain(_T(".........com.cn")) == _T(".com.cn"));
		ASSERT(TLD::getEffectiveDomain(_T("192.168.0.1")) == _T("192.168.0.1"));
		ASSERT(TLD::getEffectiveDomain(_T("what.is.this.domain.اليمن")) == _T("domain.اليمن"));
	}

	void doTest()
	{
		testReplace();
		testTLD();
	}
}

#endif
