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

// RAIILock.cpp : RAII lock, mutex and condition mechanism implementation
//

#include "StdAfx.h"

#include "RAIILock.h"

using namespace abp;

Mutex::Mutex()
{
	m_pcs = new CRITICAL_SECTION;
	InitializeCriticalSectionAndSpinCount(m_pcs, 4096);
}

Mutex::~Mutex()
{
	DeleteCriticalSection(m_pcs);
	delete m_pcs;
}

void Mutex::lock() const
{
	EnterCriticalSection(m_pcs);
}

void Mutex::unlock() const
{
	LeaveCriticalSection(m_pcs);
}

namespace abp {
	class Monitor {
	public:
		Monitor() {}
		~Monitor() { ASSERT(m_deqWaitSet.empty()); }

		void wait(CRITICAL_SECTION* pcs);
		void notify();
		void notifyAll();
	private:
		Monitor(Monitor const&);
		Monitor& operator=(Monitor const&);

		HANDLE push();
		HANDLE pop();

		std::deque<HANDLE> m_deqWaitSet;
	};
}

void Monitor::wait(CRITICAL_SECTION* pcs)
{
	HANDLE hWaitEvent = push();
	LeaveCriticalSection(pcs);

	// NOTE: Conceptually, releasing the lock and entering the wait
	// state is done in one atomic step. Technically, that is not
	// true here, because we first leave the critical section and
	// then, in a separate line of code, call WaitForSingleObjectEx.
	// The reason why this code is correct is that our thread is placed
	// in the wait set *before* the lock is released. Therefore, if
	// we get preempted right here and another thread notifies us, then
	// that notification will *not* be missed: the wait operation below
	// will find the event signalled.
	DWORD dwWaitResult = WaitForSingleObjectEx(hWaitEvent, INFINITE, false);
	EnterCriticalSection(pcs);
	CloseHandle(hWaitEvent);
}

void Monitor::notify()
{
	HANDLE hWaitEvent = pop();
	if (!hWaitEvent) return;
	SetEvent(hWaitEvent);
}

void Monitor::notifyAll()
{
	for(auto iter = m_deqWaitSet.begin(); iter != m_deqWaitSet.end(); ++iter)
	{
		if (*iter) SetEvent(*iter);
	}
	m_deqWaitSet.clear();
}

HANDLE Monitor::push()
{
	HANDLE hWaitEvent = CreateEvent(NULL, FALSE, FALSE, NULL);
	m_deqWaitSet.push_back(hWaitEvent);
	return hWaitEvent;
}

HANDLE Monitor::pop()
{
	if (m_deqWaitSet.empty()) return NULL;
	HANDLE hWaitEvent = m_deqWaitSet.front();
	m_deqWaitSet.pop_front();
	return hWaitEvent;
}

ReaderWriterMutex::ReaderWriterMutex()
{
	m_nReaderCount = 0;

	m_pcs = new CRITICAL_SECTION;
	InitializeCriticalSectionAndSpinCount(m_pcs, 4096);

#ifdef NT6_CONDITION
	m_pcv = new CONDITION_VARIABLE;
	InitializeConditionVariable(m_pcv);
#else
	m_pMonitor = new Monitor();
#endif
}

ReaderWriterMutex::~ReaderWriterMutex()
{
#ifdef NT6_CONDITION
	delete m_pcv;
#else
	delete m_pMonitor;
#endif
	DeleteCriticalSection(m_pcs);
	delete m_pcs;
}

void ReaderWriterMutex::lockReader() const
{
	EnterCriticalSection(m_pcs);
	m_nReaderCount++;
	LeaveCriticalSection(m_pcs);
}

void ReaderWriterMutex::unlockReader() const
{
	EnterCriticalSection(m_pcs);
	m_nReaderCount--;
	if (m_nReaderCount == 0)
	{
#ifdef NT6_CONDITION
		WakeAllConditionVariable(m_pcv);
#else
		m_pMonitor->notifyAll();
#endif
	}
	LeaveCriticalSection(m_pcs);
}

void ReaderWriterMutex::lockWriter() const
{
	EnterCriticalSection(m_pcs);
	while (m_nReaderCount)
	{
#ifdef NT6_CONDITION
		SleepConditionVariableCS(m_pcv, m_pcs, INFINITE);
#else
		m_pMonitor->wait(m_pcs);
#endif
	}
}

void ReaderWriterMutex::unlockWriter() const
{
	LeaveCriticalSection(m_pcs);
}
