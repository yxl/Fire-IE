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

// TLD.cpp : Effective Top-Level-Domain Service impl.
//

#include "StdAfx.h"

#include "TLD.h"
#include "regdom-libs/dkim-regdom.h"
#include "regdom-libs/tld-canon.h"

namespace Utils {
	const regdom::tldnode* rootTLDNode = NULL;
}

using namespace Utils;

TLD::TLDInit TLD::init;

TLD::TLDInit::TLDInit()
{
	rootTLDNode = regdom::readTldTree(tldString);
	ASSERT(getEffectiveDomain(_T("")) == _T(""));
	ASSERT(getEffectiveDomain(_T("addons.mozilla.org")) == _T("mozilla.org"));
	ASSERT(getEffectiveDomain(_T("www.com.cn")) == _T("www.com.cn"));
	ASSERT(getEffectiveDomain(_T("a.b.c.idontknow")) == _T("a.b.c.idontknow"));
	ASSERT(getEffectiveDomain(_T("localhost")) == _T("localhost"));
	ASSERT(getEffectiveDomain(_T("www.sjtu.ed.cn")) == _T("ed.cn"));
	ASSERT(getEffectiveDomain(_T("www.sjtu.edu.cn")) == _T("sjtu.edu.cn"));
	ASSERT(getEffectiveDomain(_T("www.sina.com.cn")) == _T("sina.com.cn"));
	ASSERT(getEffectiveDomain(_T("co.uk")) == _T("co.uk"));
	ASSERT(getEffectiveDomain(_T("bn.sjtu.info")) == _T("sjtu.info"));
	ASSERT(getEffectiveDomain(_T("图书馆.上海交通大学.中国")) == _T("上海交通大学.中国"));
	ASSERT(getEffectiveDomain(_T("www.lib.sjtu.edu.cn")) == _T("sjtu.edu.cn"));
	ASSERT(getEffectiveDomain(_T("www.lib.sjtu.edu.cn.www.lib.sjtu.edu.cn.www.lib.sjtu.edu.cn")) == _T("sjtu.edu.cn"));
	ASSERT(getEffectiveDomain(_T("a.b.c.d.e.f.g.h.i.j.k.l.m.n")) == _T("a.b.c.d.e.f.g.h.i.j.k.l.m.n"));
	ASSERT(getEffectiveDomain(_T("..........")) == _T(".........."));
	ASSERT(getEffectiveDomain(_T(".........com.cn")) == _T(".com.cn"));
	ASSERT(getEffectiveDomain(_T("192.168.0.1")) == _T("192.168.0.1"));
	ASSERT(getEffectiveDomain(_T("what.is.this.domain.اليمن")) == _T("domain.اليمن"));
}

TLD::TLDInit::~TLDInit()
{
	freeTldTree(rootTLDNode);
}

CString TLD::getEffectiveDomain(const CString& domain)
{
	const wchar_t* utf8Result = regdom::getRegisteredDomain(domain, rootTLDNode);
	return utf8Result ? utf8Result : domain;
}
