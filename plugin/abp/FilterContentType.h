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

// FilterContentType.h : content types in abp module
//

namespace abp {
	typedef unsigned long ContentType_T;
	enum ContentType : ContentType_T {
		OTHER = 1,
		SCRIPT = 2,
		IMAGE = 4,
		STYLESHEET = 8,
		OBJECT = 16,
		SUBDOCUMENT = 32,
		DOCUMENT = 64,
		XBL = 1,
		PING = 1,
		XMLHTTPREQUEST = 2048,
		OBJECT_SUBREQUEST = 4096,
		DTD = 1,
		MEDIA = 16384,
		FONT = 32768,

		BACKGROUND = 4,    // Backwards compat, same as IMAGE

		POPUP = 0x10000000,
		DONOTTRACK = 0x20000000,
		ELEMHIDE = 0x40000000
	};
}
