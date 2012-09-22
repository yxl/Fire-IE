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

// RAIILock.cpp : RAII lock & mutex mechanism implementation
//

#include "StdAfx.h"

#include "RAIILock.h"
#include <afxmt.h>

using namespace abp;

Mutex::Mutex()
{
	m_cs = new CCriticalSection();
}

Mutex::~Mutex()
{
	delete m_cs;
}

void Mutex::lock() const
{
	m_cs->Lock();
}

void Mutex::unlock() const
{
	m_cs->Unlock();
}
