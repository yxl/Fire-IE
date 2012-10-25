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

// RAIILock.h : RAII lock, mutex and condition mechanism
//

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
		CRITICAL_SECTION* m_pcs;
	};

	class ReaderLock;
	class WriterLock;
	class Monitor;
	class ReaderWriterMutex {
	public:
		ReaderWriterMutex();
		~ReaderWriterMutex();
	private:
		ReaderWriterMutex(const ReaderWriterMutex&);
		ReaderWriterMutex& operator=(const ReaderWriterMutex&);
		void lockReader() const;
		void unlockReader() const;
		void lockWriter() const;
		void unlockWriter() const;
		friend class ReaderLock;
		friend class WriterLock;

		CRITICAL_SECTION* m_pcs;
#ifdef NT6_CONDITION
		CONDITION_VARIABLE* m_pcv;
#else
		Monitor* m_pMonitor;
#endif
		mutable unsigned int m_nReaderCount;
	};

	class Lock {
	public:
		Lock(const Mutex& mutex) : mutex(mutex) { mutex.lock(); }
		~Lock() { mutex.unlock(); }
	private:
		Lock(const Lock&);
		Lock& operator=(const Lock&);
		const Mutex& mutex;
	};

	class ReaderLock {
	public:
		ReaderLock(const ReaderWriterMutex& mutex) : mutex(mutex) { mutex.lockReader(); }
		~ReaderLock() { mutex.unlockReader(); }
	private:
		ReaderLock(const ReaderLock&);
		ReaderLock& operator=(const ReaderLock&);
		const ReaderWriterMutex& mutex;
	};

	class WriterLock {
	public:
		WriterLock(const ReaderWriterMutex& mutex) : mutex(mutex) { mutex.lockWriter(); }
		~WriterLock() { mutex.unlockWriter(); }
	private:
		WriterLock(const WriterLock&);
		WriterLock& operator=(const WriterLock&);
		const ReaderWriterMutex& mutex;
	};
} // namespace abp;
