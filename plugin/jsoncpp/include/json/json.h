// Copyright 2007-2010 Baptiste Lepilleur
// Distributed under MIT license, or public domain if desired and
// recognized in your jurisdiction.
// See file LICENSE for detail or copy at http://jsoncpp.sourceforge.net/LICENSE

#ifndef JSON_JSON_H_INCLUDED
# define JSON_JSON_H_INCLUDED

# include "autolink.h"
# include "value.h"
# include "reader.h"
# include "writer.h"
# include "features.h"

//
// Automatically link JSON library.
// Added by Yuan Xulei, 2012/3/21
//
#if defined(_DEBUG)
	#define JSON_LIB_SUFFIX "d.lib"
#else
	#define JSON_LIB_SUFFIX ".lib"
#endif
#pragma comment(lib, "lib_json" JSON_LIB_SUFFIX)

#endif // JSON_JSON_H_INCLUDED
