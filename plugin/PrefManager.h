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

	PrefManager() { m_bCookieSyncEnabled = true; }
	PrefManager(const PrefManager&);

	static PrefManager s_instance;
public:
	bool isCookieSyncEnabled() const { return m_bCookieSyncEnabled; }
	void setCookieSyncEnabled(bool value) { m_bCookieSyncEnabled = value; }

	static PrefManager& instance() { return s_instance; }
};
