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

// TList.h : optimized for one-item lists
// Warning: Do not use this for complex types.
//          It is designed merely for primitive types (including pointers).
//

#include <vector>
#include <algorithm>

namespace abp {

	template<class T>
		class TList {
		public:
			TList() : count(0) { } 
			explicit TList(const T& t) : t(t), count(1) { }
			explicit TList(T&& t) : t(std::move(t)), count(1) { }
			TList(const std::vector<T>& ts)
			{
				count = (unsigned int)ts.size();
				if (count > 1) pts = new std::vector<T>(ts);
				else if (count) t = ts[0];
			}
			TList(std::vector<T>&& ts)
			{
				count = (unsigned int)ts.size();
				if (count > 1) pts = new std::vector<T>(std::move(ts));
				else if (count) t = std::move(ts[0]);
			}
			TList(const TList& tl)
			{
				count = tl.count;
				if (count > 1) pts = new std::vector<T>(*tl.pts);
				else if (count) t = tl.t;
			}
			TList(TList&& tl)
			{
				count = tl.count;
				if (count > 1) pts = tl.pts;
				else if (count) t = tl.t;
				tl.count = 0;
				tl.pts = NULL;
			}
			TList& operator=(const std::vector<T>& ts)
			{
				return *this = TList(ts);
			}
			TList& operator=(std::vector<T>&& ts)
			{
				return *this = TList(std::move(ts));
			}
			TList& operator=(const TList& tl)
			{
				if (this == &tl) return *this;
				if (count > 1) delete pts;
				count = tl.count;
				if (count > 1) pts = new std::vector<T>(*tl.pts);
				else if (count) t = tl.t;
				return *this;
			}
			TList& operator=(TList&& tl)
			{
				if (this == &tl) return *this;
				if (count > 1) delete pts;
				count = tl.count;
				if (count > 1) pts = tl.pts;
				else if (count) t = tl.t;
				tl.count = 0;
				tl.pts = NULL;
				return *this;
			}
			unsigned int size() const { return count; }
			const T& operator[] (unsigned int idx) const { return count > 1 ? (*pts)[idx] : t; }
			T& operator[] (unsigned int idx) { return count > 1 ? (*pts)[idx] : t; }

			void push_back(const T& t)
			{
				count++;
				if (count == 1) this->t = t;
				else if (count == 2)
				{
					std::vector<T>* pts = new std::vector<T>();
					pts->push_back(std::move(this->t));
					pts->push_back(t);
					this->pts = pts;
				}
				else
					this->pts->push_back(t);
			}

			void remove(const T& t)
			{
				if (count == 1)
				{
					if (this->t == t)
					{
						this->t = T();
						count = 0;
					}
				}
				else if (count > 1)
				{
					auto iter = std::find(pts->begin(), pts->end(), t);
					if (iter != pts->end())
					{
						pts->erase(iter);
						if (--count == 1)
						{
							T tmpt = std::move((*pts)[0]);
							delete pts;
							this->t = std::move(tmpt);
						}
					}
				}
			}
			~TList() { if (count > 1) delete pts; }
		private:
			unsigned int count;
			union {
				T t;
				std::vector<T>* pts;
			};
		};
} // namespace abp
