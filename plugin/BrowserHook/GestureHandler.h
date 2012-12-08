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

#include <vector>

namespace BrowserHook
{

	enum MessageHandleResult
	{
		MHR_NotHandled, MHR_Initiated, MHR_Swallowed, MHR_Triggered, MHR_Canceled, MHR_GestureEnd
	};

	enum GestureState
	{
		GS_None, GS_Initiated, GS_Triggered
	};

	/* Abstract class that determines whether we should forward mouse gesture related messages */
	class GestureHandler
	{
	private:
		bool shouldKeepTrack(MessageHandleResult res) const;
		static bool shouldUsePost();

		static struct Handlers {
			~Handlers();
			std::vector<GestureHandler*> m_vHandlers;
		} s_handlers;

		static std::vector<GestureHandler*>& s_vHandlers;
	protected:
		GestureState m_state;
		bool m_bEnabled;

		/* keep track of swallowed messages */
		std::vector<MSG> m_vMessages;

		GestureHandler();
		void setState(GestureState);

		virtual MessageHandleResult handleMessageInternal(MSG*) = 0;
		virtual ~GestureHandler();
	public:
		virtual CString getName() const = 0;
		MessageHandleResult handleMessage(MSG*);
		GestureState getState() const;
		void setEnabled(bool);
		bool getEnabled() const;
		virtual void forwardAllOrigin(HWND origin);
		virtual void forwardAllTarget(HWND origin, HWND target);
		virtual bool shouldSwallow(MessageHandleResult res) const;
		void reset();

		static const std::vector<GestureHandler*>& getHandlers();
		static void setEnabledGestures(const CString aStrGestureNames[], int iCount);

		static void forwardOrigin(MSG* msg);
		static void forwardTarget(MSG* msg, HWND target);
	};
}
