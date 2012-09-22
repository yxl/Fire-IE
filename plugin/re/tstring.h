#include <string>
#include <tchar.h>
#include <xhash>

namespace re {
	typedef std::basic_string<TCHAR> _tstring;
}

namespace std {
	template<>
		struct less<re::_tstring>
			: public std::binary_function<re::_tstring, re::_tstring, bool>
		{	// functor for operator<
		bool operator()(const re::_tstring& _Left, const re::_tstring& _Right) const
			{	// apply operator< to operands
				return _Left.compare(_Right) < 0;
			}
		};
}
