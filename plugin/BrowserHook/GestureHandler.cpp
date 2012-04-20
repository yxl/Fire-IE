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

std::vector<GestureHandler*> GestureHandler::s_vHandlers;

GestureHandler::GestureHandler() :
	m_state(GS_None)
{ }

GestureHandler::~GestureHandler()
{ }

void GestureHandler::setState(GestureState state)
{
	this->m_state = state;
}

GestureState GestureHandler::getState() const
{
	return m_state;
}

void GestureHandler::forwardAllOrigin(HWND hOrigin)
{
	_ASSERT(hOrigin != NULL);
	for (std::vector<MSG>::iterator iter = m_vMessages.begin();
		iter != m_vMessages.end() && (iter + 1) != m_vMessages.end(); ++iter)
	{
		::SendMessage(hOrigin, iter->message, iter->wParam, iter->lParam);
	}
	size_t size;
	if (size = m_vMessages.size())
	{
		MSG* msg = &m_vMessages[size - 1];
		::PostMessage(hOrigin, msg->message, msg->wParam, msg->lParam);
	}
	m_vMessages.clear();
}

void GestureHandler::forwardAllTarget(HWND hOrigin, HWND hTarget)
{
	_ASSERT(hOrigin != NULL && hTarget != NULL);
	for (std::vector<MSG>::iterator iter = m_vMessages.begin();
		iter != m_vMessages.end() && (iter + 1) != m_vMessages.end(); ++iter)
	{
		CPoint pt(iter->lParam);
		ClientToScreen(hOrigin, &pt);
		ScreenToClient(hTarget, &pt);
		::PostMessage(hTarget, iter->message, iter->wParam, MAKELPARAM(pt.x, pt.y));
	}
	size_t size;
	if (size = m_vMessages.size())
	{
		MSG* msg = &m_vMessages[size - 1];
		CPoint pt(msg->lParam);
		ClientToScreen(hOrigin, &pt);
		ScreenToClient(hTarget, &pt);
		::PostMessage(hTarget, msg->message, msg->wParam, MAKELPARAM(pt.x, pt.y));
	}
	m_vMessages.clear();
}

void GestureHandler::reset()
{
	m_state = GS_None;
	m_vMessages.clear();
}

bool GestureHandler::shouldKeepTrack(MessageHandleResult res) const
{
	return m_state == GS_Initiated || res == MHR_Triggered || res == MHR_Canceled;
}

bool GestureHandler::shouldSwallow(MessageHandleResult res) const
{
	return shouldKeepTrack(res);
}

MessageHandleResult GestureHandler::handleMessage(MSG* msg)
{
	MessageHandleResult res = this->handleMessageInternal(msg);
	if (shouldKeepTrack(res))
	{
		m_vMessages.push_back(*msg);
	}
	return res;
}

void GestureHandler::forwardOrigin(MSG* pMsg)
{
	::PostMessage(pMsg->hwnd, pMsg->message, pMsg->wParam, pMsg->lParam);
}

void GestureHandler::forwardTarget(MSG* pMsg, HWND hTarget)
{
	CPoint pt(pMsg->lParam);
	ClientToScreen(pMsg->hwnd, &pt);
	ScreenToClient(hTarget, &pt);
	::PostMessage(hTarget, pMsg->message, pMsg->wParam, MAKELPARAM(pt.x, pt.y));
}
