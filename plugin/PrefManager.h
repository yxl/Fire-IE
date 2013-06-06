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

// PrefManager.h : Manages preferences set by extension part
//

class PrefManager {
private:
	bool m_bCookieSyncEnabled;
	bool m_bDNTEnabled;
	int m_nDNTValue;

	PrefManager()
	{
		m_bCookieSyncEnabled = true;
		m_bDNTEnabled = false;
		m_nDNTValue = 1;
	}
	PrefManager(const PrefManager&);

	static PrefManager s_instance;
public:
	bool isCookieSyncEnabled() const { return m_bCookieSyncEnabled; }
	void setCookieSyncEnabled(bool value) { m_bCookieSyncEnabled = value; }

	bool isDNTEnabled() const { return m_bDNTEnabled; }
	void setDNTEnabled(bool value) { m_bDNTEnabled = value; }

	int getDNTValue() const { return m_nDNTValue; }
	void setDNTValue(int value) { m_nDNTValue = value; }

	static PrefManager& instance() { return s_instance; }
};
