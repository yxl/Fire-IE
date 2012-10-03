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

#include "dkim-regdom.h"

using namespace std;

namespace Utils { namespace regdom {

wchar_t ALL[] = L"*";
wchar_t THIS[] = L"!";

// wchar_t* tldString = "root(3:ac(5:com,edu,gov,net,ad(3:nom,co!,*)),de,com)";

// helper function to parse node in tldString
int readTldString(tldnode* node, wchar_t* s, int len, int pos) {

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
						node->subnodes[i] = (tldnode*)malloc(sizeof(tldnode));
						pos = readTldString(node->subnodes[i], s, len, pos + 1);
					}

					return pos + 1;
				}

				break;
		}

		pos++;
	} while (pos < len);

	return pos;
}

// reads TLDs once at daemon startup
tldnode* readTldTree(wchar_t* tlds) {
	tldnode* root = (tldnode *)malloc(sizeof(tldnode));

	readTldString(root, tlds, wcslen(tlds), 0);

	return root;
}

#ifdef DEBUG

void printTldTree(tldnode* node, const wchar_t * spacer) {
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

void freeTldTree(tldnode* node) {

	if (node->num_children != 0) {
		int i;
		for(i = 0; i < node->num_children; i++) {
			freeTldTree(node->subnodes[i]);
		}
	}
	free(node->dom);
	free(node);
}

// linear search for domain (and * if available)
tldnode* findTldNode(tldnode* parent, wchar_t* subdom) {

	tldnode* allNode = NULL;

	int i;
	for (i=0; i<parent->num_children; i++) {
		if (wcscmp(subdom, parent->subnodes[i]->dom) == 0) {
			return parent->subnodes[i];
		}
		if (allNode==NULL && wcscmp(ALL, parent->subnodes[i]->dom) == 0) {
			allNode = parent->subnodes[i];
		}
	}
	return allNode;
}

// concatenate a domain with its parent domain
wchar_t* concatDomLabel(wchar_t* dl, wchar_t* du) {

	wchar_t* s;

	if (dl == NULL) {
		int count = wcslen(du) + 1;
		s = (wchar_t*) malloc(count * sizeof(wchar_t));
		wcsncpy_s(s, count, du, count);
	} else {
		int lenl = wcslen(dl);
		int lenu = wcslen(du);
		s = (wchar_t*) malloc((lenl+1+lenu+1) * sizeof(wchar_t));
		wcsncpy_s(s, lenl+1+lenu+1, dl, lenl);
		wcsncpy_s(s+lenl, 1+lenu+1, L".", 1);
		wcsncpy_s(s+lenl+1, lenu+1, du, lenu+1);
	}
	return s;
}

// recursive helper method
wchar_t* findRegisteredDomain(tldnode* subtree, dlist* dom) {

	tldnode* subNode = findTldNode(subtree, dom->val);
	if (subNode==NULL || (subNode->num_children==1 && subNode->subnodes[0]->attr == THIS)) {
		int count = wcslen(dom->val)+1;
		wchar_t* domain = (wchar_t*) malloc(count * sizeof(wchar_t));
		wcsncpy_s(domain, count, dom->val, count);
		return domain;
	} else if (dom->next==NULL) {
		return NULL;
	}

	wchar_t* fRegDom = findRegisteredDomain(subNode, dom->next);
	wchar_t* concDomain = NULL;
	if (fRegDom!=NULL) {
		concDomain = concatDomLabel(fRegDom, dom->val);
		free(fRegDom);
	}

	return concDomain;
}

void freeDomLabels(dlist* head, wchar_t* sDcopy) {

	dlist* cur;

	// free list of separated domain parts
	while (head) {
		cur = head;
		head = cur->next;
		free(cur);
	}

	free(sDcopy);
}

wchar_t* getRegisteredDomain(const wchar_t* signingDomain, tldnode* tree) {

	dlist *cur, *head = NULL;
	wchar_t *saveptr;

	// split domain by . separator
	int count = wcslen(signingDomain)+1;
	wchar_t* sDcopy = (wchar_t*) malloc(count * sizeof(wchar_t));
	wcsncpy_s(sDcopy, count, signingDomain, count);
	wchar_t* token = wcstok_s(sDcopy, L".", &saveptr);
	while (token != NULL) {
		cur = (dlist*) malloc(sizeof(dlist));
		cur->val = token;
		cur->next = head;
		head = cur;
		token = wcstok_s(NULL, L".", &saveptr);
	}

	if (!head) return NULL;

	wchar_t* result = findRegisteredDomain(tree, head);

	if (result==NULL) {
		freeDomLabels(head, sDcopy);
		return NULL;
	}

	// assure there is at least 1 TLD in the stripped signing domain
	if (wcschr(result, L'.')==NULL) {
		free(result);
		if (head->next == NULL) {
			freeDomLabels(head, sDcopy);
			return NULL;
		} else {
			wchar_t* minDomain = concatDomLabel(head->next->val, head->val);
			freeDomLabels(head, sDcopy);
			return minDomain;
		}
	}

	freeDomLabels(head, sDcopy);
	return result;
}

} } // namespace Utils::regdom
