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

#include "regdom-libs/dkim-regdom.h"
#include "App.h"
#include "File.h"

namespace Utils { namespace TLD {

static const regdom::tldnode* rootTLDNode = NULL;

static class TLDInit {
public:
	TLDInit();
	~TLDInit();
} init;

TLDInit::TLDInit()
{
	// The tldstring is downloadable from http://www.agitos.de/regdom-lib-downloads/
	CFile file;
	if (file.Open(App::GetModulePath() + _T("tldstring.txt"), CFile::modeRead | CFile::shareDenyWrite))
	{
		wstring tldString;
		bool success = File::readFile(file, tldString);
		file.Close();
		if (success)
		{
			rootTLDNode = regdom::readTldTree(tldString.c_str());
		}
	}
}

TLDInit::~TLDInit()
{
	freeTldTree(rootTLDNode);
}

CString getEffectiveDomain(const CString& domain)
{
	const wchar_t* utf8Result = regdom::getRegisteredDomain(domain, rootTLDNode);
	return utf8Result ? utf8Result : domain;
}

} } // namespace Utils::TLD
