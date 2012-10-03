/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to you under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at:
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 *
 * Christian Heindl, 29.12.2008, heindlc@agitos.de
 * Florian Sager, 03.01.2009, sager@agitos.de
 * Ward van Wanrooij, 04.04.2010, ward@ward.nu
 *
 */

#pragma once

namespace Utils { namespace regdom {

/* DATA TYPES */
struct tldnode_el {
	wchar_t* dom;
	wchar_t* attr;

	int num_children;
	struct tldnode_el** subnodes;
};

typedef struct tldnode_el tldnode;

struct dlist_el {
	wchar_t* val;

	struct dlist_el* next;
};

typedef struct dlist_el dlist;

/* PROTOTYPES */
extern int readTldString(tldnode*,wchar_t*,int,int);
extern tldnode* findTldNode(tldnode*,wchar_t*);
extern wchar_t* concatDomLabel(wchar_t*,wchar_t*);
extern wchar_t* findRegisteredDomain(tldnode*,dlist*);
extern void freeDomLabels(dlist*,wchar_t*);
extern tldnode* readTldTree(wchar_t*);
extern wchar_t* getRegisteredDomain(const wchar_t*,tldnode*);
extern void freeTldTree(tldnode*);

#ifdef DEBUG
extern void printTldTree(tldnode*, const wchar_t *);
#endif /* DEBUG */

} } // namespace Utils::regdom
