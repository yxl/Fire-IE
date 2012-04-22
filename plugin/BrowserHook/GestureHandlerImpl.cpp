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

#include "StdAfx.h"
#include "GestureHandler.h"

using namespace BrowserHook;

namespace BrowserHook
{
	class TraceHandler: public GestureHandler
	{
	private:
		CPoint m_ptStart;
	protected:
		MessageHandleResult handleMessageInternal(MSG* msg);
	public:
		TraceHandler();
	};

	class RockerHandler: public GestureHandler
	{
	private:
		CPoint m_ptStart;
		bool m_bLeft;
	protected:
		MessageHandleResult handleMessageInternal(MSG* msg);
	public:
		RockerHandler();
		bool shouldSwallow(MessageHandleResult) const;
		void forwardAllOrigin(HWND origin);
	};

	class WheelHandler: public GestureHandler
	{
	private:
		CPoint m_ptStart;
	protected:
		MessageHandleResult handleMessageInternal(MSG* msg);
	public:
		WheelHandler();
	};
}

TraceHandler::TraceHandler() :
	m_ptStart(-1, -1)
{

}

MessageHandleResult TraceHandler::handleMessageInternal(MSG* pMsg)
{
	CPoint ptCurrent(pMsg->lParam);
	CSize dist;
	switch (getState())
	{
	case GS_None:
		if (pMsg->message == WM_RBUTTONDOWN)
		{
			m_ptStart = ptCurrent;
			setState(GS_Initiated);
			TRACE(_T("Down\n"));
			return MHR_Initiated;
		}
		break;
	case GS_Initiated:
		dist = ptCurrent - m_ptStart;
		if (pMsg->message == WM_MOUSEMOVE && (pMsg->wParam & MK_RBUTTON))
		{
			if (abs(dist.cx) > 10 || abs(dist.cy) > 10)
			{
				setState(GS_Triggered);
				TRACE(_T("Trigger\n"));
				return MHR_Triggered;
			}
			else
				return MHR_Swallowed;
		}
		else
		{
			TRACE(_T("Up\n"));
			setState(GS_None);
			return MHR_Canceled;
		}
		break;
	case GS_Triggered:
		if (pMsg->message == WM_MOUSEMOVE && (pMsg->wParam & MK_RBUTTON))
		{
			return MHR_Swallowed;
		}
		else
		{
			TRACE(_T("Up\n"));
			setState(GS_None);
			return MHR_GestureEnd;
		}
		break;
	}
	return MHR_NotHandled;
}

RockerHandler::RockerHandler():
	m_ptStart(-1, -1), m_bLeft(false)
{

}

MessageHandleResult RockerHandler::handleMessageInternal(MSG* pMsg)
{
	CPoint ptCurrent(pMsg->lParam);
	CSize dist;
	switch (getState())
	{
	case GS_None:
		if (pMsg->message == WM_LBUTTONDOWN || pMsg->message == WM_RBUTTONDOWN)
		{
			m_ptStart = ptCurrent;
			m_bLeft = (pMsg->message == WM_LBUTTONDOWN);
			setState(GS_Initiated);
			TRACE(CString(_T("Rocker Down: ")) + (m_bLeft ? _T(" left\n") : _T(" right\n")));
			return MHR_Initiated;
		}
		break;
	case GS_Initiated:
		dist = ptCurrent - m_ptStart;
		if (pMsg->message == WM_MOUSEMOVE && (pMsg->wParam & (m_bLeft ? MK_LBUTTON : MK_RBUTTON)))
		{
			if (abs(dist.cx) > 10 || abs(dist.cy) > 10)
			{
				setState(GS_None);
				TRACE(_T("Rocker Cancel\n"));
				return MHR_Canceled;
			}
			else
				return MHR_Swallowed;
		}
		else if (pMsg->message == (m_bLeft ? WM_RBUTTONDOWN : WM_LBUTTONDOWN)
			&& (pMsg->wParam & (m_bLeft ? MK_LBUTTON : MK_RBUTTON)))
		{
			TRACE(_T("Rocker Trigger\n"));
			setState(GS_Triggered);
			return MHR_Triggered;
		}
		else
		{
			TRACE(_T("Rocker Cancel\n"));
			setState(GS_None);
			return MHR_Canceled;
		}
		break;
	case GS_Triggered:
		if ((pMsg->wParam & (m_bLeft ? MK_LBUTTON : MK_RBUTTON)) == 0
			|| (pMsg->message != (m_bLeft ? WM_RBUTTONDOWN : WM_LBUTTONDOWN)
				&& pMsg->message != (m_bLeft ? WM_RBUTTONUP : WM_LBUTTONUP)
				&& pMsg->message != WM_MOUSEMOVE))
		{
			TRACE(_T("Rocker Up\n"));
			setState(GS_None);
			return MHR_GestureEnd;
		}
		else
		{
			return MHR_Swallowed;
		}
		break;
	}
	return MHR_NotHandled;
}

bool RockerHandler::shouldSwallow(MessageHandleResult res) const
{
	// don't swallow anything related to left->right gesture
	if (m_bLeft) return false;
	return GestureHandler::shouldSwallow(res);
}

void RockerHandler::forwardAllOrigin(HWND hOrigin)
{
	// also don't forward anything to origin if gesture is left->right
	if (m_bLeft) return;
	GestureHandler::forwardAllOrigin(hOrigin);
}

WheelHandler::WheelHandler() :
	m_ptStart(-1, -1)
{

}

MessageHandleResult WheelHandler::handleMessageInternal(MSG* pMsg)
{
	CPoint ptCurrent(pMsg->lParam);
	CSize dist;
	switch (getState())
	{
	case GS_None:
		if (pMsg->message == WM_RBUTTONDOWN)
		{
			m_ptStart = ptCurrent;
			setState(GS_Initiated);
			TRACE(_T("Wheel Right Down\n"));
			return MHR_Initiated;
		}
		break;
	case GS_Initiated:
		dist = ptCurrent - m_ptStart;
		if (pMsg->message == WM_MOUSEMOVE && (pMsg->wParam & MK_RBUTTON))
		{
			if (abs(dist.cx) > 10 || abs(dist.cy) > 10)
			{
				setState(GS_None);
				TRACE(_T("Wheel Right Cancel\n"));
				return MHR_Canceled;
			}
			else
				return MHR_Swallowed;
		}
		else if (pMsg->message == WM_MOUSEWHEEL && (pMsg->wParam & MK_RBUTTON))
		{
			TRACE(_T("Wheel Trigger\n"));
			setState(GS_Triggered);
			return MHR_Triggered;
		}
		else
		{
			TRACE(_T("Wheel Right Cancel\n"));
			setState(GS_None);
			return MHR_Canceled;
		}
		break;
	case GS_Triggered:
		if ((pMsg->message == WM_MOUSEMOVE || pMsg->message == WM_MOUSEWHEEL) && (pMsg->wParam & MK_RBUTTON))
		{
			return MHR_Swallowed;
		}
		else
		{
			TRACE(_T("Wheel Right Up\n"));
			setState(GS_None);
			return MHR_GestureEnd;
		}
		break;
	}
	return MHR_NotHandled;
}

const std::vector<GestureHandler*>& GestureHandler::getHandlers()
{
	if (s_vHandlers.size() == 0)
	{
		s_vHandlers.push_back(new TraceHandler());
		s_vHandlers.push_back(new RockerHandler());
		s_vHandlers.push_back(new WheelHandler());
	}
	return s_vHandlers;
}
