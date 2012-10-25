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

/* nsIContentPolicy content type constants definition */

namespace HttpMonitor
{
	typedef unsigned long ContentType_T;

	namespace ContentType
	{
		const unsigned long TYPE_OTHER       = 1;

		/**
		* Indicates an executable script (such as JavaScript).
		*/
		const unsigned long TYPE_SCRIPT      = 2;

		/**
		* Indicates an image (e.g., IMG elements).
		*/
		const unsigned long TYPE_IMAGE       = 3;

		/**
		* Indicates a stylesheet (e.g., STYLE elements).
		*/
		const unsigned long TYPE_STYLESHEET  = 4;

		/**
		* Indicates a generic object (plugin-handled content typically falls under
		* this category).
		*/
		const unsigned long TYPE_OBJECT      = 5;

		/**
		* Indicates a document at the top-level (i.e., in a browser).
		*/
		const unsigned long TYPE_DOCUMENT    = 6;

		/**
		* Indicates a document contained within another document (e.g., IFRAMEs,
		* FRAMES, and OBJECTs).
		*/
		const unsigned long TYPE_SUBDOCUMENT = 7;

		/**
		* Indicates a timed refresh.
		*
		* shouldLoad will never get this, because it does not represent content
		* to be loaded (the actual load triggered by the refresh will go through
		* shouldLoad as expected).
		*
		* shouldProcess will get this for, e.g., META Refresh elements and HTTP
		* Refresh headers.
		*/
		const unsigned long TYPE_REFRESH     = 8;

		/**
		* Indicates an XBL binding request, triggered either by -moz-binding CSS
		* property or Document.addBinding method.
		*/
		const unsigned long TYPE_XBL         = 9;

		/**
		* Indicates a ping triggered by a click on <A PING="..."> element.
		*/
		const unsigned long TYPE_PING        = 10;

		/**
		* Indicates an XMLHttpRequest.
		*/
		const unsigned long TYPE_XMLHTTPREQUEST = 11;

		/**
		* Indicates a request by a plugin.
		*/
		const unsigned long TYPE_OBJECT_SUBREQUEST = 12;

		/**
		* Indicates a DTD loaded by an XML document.
		*/
		const unsigned long TYPE_DTD = 13;
	}
}
