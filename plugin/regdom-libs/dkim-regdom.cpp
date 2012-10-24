/*
 * Calculate the effective registered domain of a fully qualified domain name.
 *
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
 * Florian Sager, 03.01.2009, sager@agitos.de
 * Christian Heindl, 29.12.2008, heindlc@agitos.de
 * Ward van Wanrooij, 04.04.2010, ward@ward.nu
 *
 */

#include <cstdlib>
#include <cstdio>
#include <cstring>
#include <algorithm>

#include "dkim-regdom.h"

using namespace std;

namespace Utils { namespace regdom {

extern int readTldString(tldnode*, const wchar_t*, int, int);
extern const tldnode* findTldNode(const tldnode*, const wchar_t*, int len);

wchar_t ALL[] = L"*";
wchar_t THIS[] = L"!";

// wchar_t* tldString = "root(3:ac(5:com,edu,gov,net,ad(3:nom,co!,*)),de,com)";

// helper function to parse node in tldString
int readTldString(tldnode* node, const wchar_t* s, int len, int pos) {

	int start = pos;
	int state = 0;

	memset(node, 0, sizeof(tldnode));
	do {
		wchar_t c = *(s+pos);

		switch(state) {
			case 0: // general read

				if (c==L',' || c==L')' || c==L'(') {
					// add last domain
					int count = node->attr == THIS ? pos - start : pos - start + 1;
					node->dom = (wchar_t*) malloc(count * sizeof(wchar_t));
					wcsncpy_s(node->dom, count, s+start, _TRUNCATE);

					if (c==L'(') {
						// read number of children
						start = pos;
						state = 1;
					} else if (c==L')' || c==L',') {
						// return to parent domains
						return pos;
					}

				} else if (c==L'!') {
					node->attr=THIS;
				}

				break;
			case 1: // reading number of elements (<number>:

				if (c==L':') {
					int count = pos - start;
					wchar_t* buf = (wchar_t*) malloc(count * sizeof(wchar_t));
					wcsncpy_s(buf, count, s+start+1, _TRUNCATE);
					node->num_children = wcstol(buf, NULL, 10);
					free(buf);

					// allocate space for children
					node->subnodes = (tldnode**) malloc(node->num_children * sizeof(tldnode*));

					int i;
					for (i=0; i<node->num_children; i++) {
						tldnode* subnode = (tldnode*)malloc(sizeof(tldnode));
						pos = readTldString(subnode, s, len, pos + 1);
						node->subnodes[i] = subnode;
					}

					// sort alphabetically for better search performance
					sort(node->subnodes, node->subnodes + node->num_children,
						[] (const tldnode* node1, const tldnode* node2) -> bool {
							// asterisks always comes first
							if (wcscmp(node1->dom, ALL) == 0) return true;
							if (wcscmp(node2->dom, ALL) == 0) return false;
							
							return wcscmp(node1->dom, node2->dom) < 0;
						}
					);

					return pos + 1;
				}

				break;
		}

		pos++;
	} while (pos < len);

	return pos;
}

// reads TLDs once at daemon startup
const tldnode* readTldTree(const wchar_t* tlds) {
	tldnode* root = (tldnode *)malloc(sizeof(tldnode));

	readTldString(root, tlds, (int)wcslen(tlds), 0);

	return root;
}

#ifdef DEBUG

void printTldTree(const tldnode* node, const wchar_t * spacer) {
	if (node->num_children != 0) {
		// has children
		wprintf(L"%ls%ls:\n", spacer, node->dom);

		int i;
		for(i = 0; i < node->num_children; i++) {
			wchar_t dest[100];
			swprintf(dest, L"  %ls", spacer);

			printTldTree(node->subnodes[i], dest);
		}
	} else {
		// no children
		wprintf(L"%ls%ls: %ls\n", spacer, node->dom, node->attr);
	}
}

#endif /* DEBUG */

void freeTldTree(const tldnode* node) {

	if (node->num_children != 0) {
		int i;
		for(i = 0; i < node->num_children; i++) {
			freeTldTree(node->subnodes[i]);
		}
	}
	free(node->dom);
	free(const_cast<tldnode*>(node));
}

// binary search for domain (and * if available)
const tldnode* findTldNode(const tldnode* parent, const wchar_t* subdom, int len) {
	if (!parent->num_children) return NULL;

	const tldnode* allNode = 
		wcscmp(parent->subnodes[0]->dom, ALL) == 0 ? parent->subnodes[0] : NULL;

	int l = allNode ? 1 : 0;
	int h = parent->num_children;
	while (l < h) {
		int m = (l + h) / 2;
		int cmp = wcsncmp(subdom, parent->subnodes[m]->dom, len);
		if (cmp == 0 && !parent->subnodes[m]->dom[len])
			return parent->subnodes[m];
		if (cmp > 0)
			l = m + 1;
		else
			h = m;
	}
	return allNode;
}

const wchar_t* getRegisteredDomain(const wchar_t* signingDomain, const tldnode* tree) {
	// split domain by . separator, and find tld simutaneously
	const wchar_t* sDbegin = signingDomain;
	const wchar_t* sDend = signingDomain + wcslen(signingDomain);
	reverse_iterator<const wchar_t*> sDrbegin(sDend);
	reverse_iterator<const wchar_t*> sDrend(sDbegin);

	reverse_iterator<const wchar_t*> next;
	
	const tldnode* subtree = tree;

	while (sDrend != (next = find(sDrbegin, sDrend, L'.'))) {
		const tldnode* subnode = 
			findTldNode(subtree, next.base(), (int)(sDrbegin.base() - next.base()));
		if (subnode == NULL || (subnode->num_children == 1 && subnode->subnodes[0]->attr == THIS))
			return sDrbegin.base() != sDend ? next.base() : NULL;
		subtree = subnode;
		sDrbegin = next + 1;
	}

	if (sDrbegin.base() == sDend)
		return NULL;

	const tldnode* subnode = 
		findTldNode(subtree, sDrend.base(), (int)(sDrbegin.base() - sDrend.base()));
	if (subnode == NULL || (subnode->num_children == 1 && subnode->subnodes[0]->attr == THIS))
		return sDrend.base();

	return NULL;
}

} } // namespace Utils::regdom
