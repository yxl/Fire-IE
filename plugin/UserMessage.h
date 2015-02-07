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

namespace UserMessage
{
	// User defined window message
	static const UINT WM_USER_MESSAGE =  WM_USER + 200;

	//
	// Sub-types of the user defined window message
	//

	struct SetFirefoxCookieParams
	{
		CString strURL;
		CString strCookie;
	};

	struct NavigateParams
	{
		CString strURL;
		CString strPost;
		CString strHeaders;

		void Clear()
		{
			strURL.Empty();
			strPost.Empty();
			strHeaders.Empty();
		}
	};

	static const WPARAM WPARAM_ABP_FILTER_LOADED = 11;
	static const WPARAM WPARAM_ABP_LOAD_FAILURE = 12;
	static const WPARAM WPARAM_RUN_ASYNC_CALL = 13;
}
