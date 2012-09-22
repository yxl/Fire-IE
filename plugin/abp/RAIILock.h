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

// RAIILock.h : RAII lock & mutex mechanism
//

class CCriticalSection;

namespace abp
{
	class Lock;
	class Mutex
	{
	public:
		Mutex();
		~Mutex();
	private:
		Mutex(const Mutex&);
		Mutex& operator=(const Mutex&);
		void lock() const;
		void unlock() const;
		friend class Lock;
		CCriticalSection* m_cs;
	};

	class Lock
	{
	public:
		Lock(const Mutex& mutex) : mutex(mutex) { mutex.lock(); }
		~Lock() { mutex.unlock(); }
	private:
		Lock(const Lock&);
		Lock& operator=(const Lock&);
		const Mutex& mutex;
	};
} // namespace abp;
