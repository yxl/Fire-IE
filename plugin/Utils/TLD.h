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

// TLD.h : Effective Top-Level-Domain Service
//

namespace Utils { namespace TLD {
	/* 
	 * get effective domain from full-qualified domain
	 * guaranteed to return something if domain is valid
	 * (no error-checking at caller side is needed)
	 * Return values:
	 * 1) <tld> if ingoingDomain is a TLD
	 * 2) the registered domain name if TLD is known
	 * 3) just <domain>.<tld> if <tld> is unknown
	 *    This case was added to support new TLDs in outdated reg-dom libs
	 *    by a certain likelihood. This fallback method is implemented in the
	 *    last conversion step and can be simply commented out. 
	 */
	CString getEffectiveDomain(const CString& domain);
} } // namespace Utils::TLD
