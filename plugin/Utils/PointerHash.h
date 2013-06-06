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

// PointerHash.h : Hasher and Equality comparator definition for pointer types
//

namespace Utils {
	extern std::hash<size_t> size_t_hasher;

	template<class T>
	class PointerHasher: public std::unary_function<T*, size_t> {
	public:
		size_t operator()(T* pointer) const { return size_t_hasher(reinterpret_cast<size_t>(pointer)); }
	};

	template<class T>
	class PointerEqualTo: public std::binary_function<T*, T*, bool> {
	public:
		bool operator()(T* ptr1, T* ptr2) const { return ptr1 == ptr2; }
	};
} // namespace Utils
