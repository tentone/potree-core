"use strict";

/**
 * An item in the lru list.
 *
 * @param node
 * @class LRUItem
 */
function LRUItem(node)
{
	this.previous = null;
	this.next = null;
	this.node = node;
}

/**
 * A doubly-linked-list of the least recently used elements.
 *
 * @class LRU
 */
function LRU()
{
	// the least recently used item
	this.first = null;

	// the most recently used item
	this.last = null;

	// a list of all items in the lru list
	this.items = {};
	this.elements = 0;
	this.numPoints = 0;
}

/**
 * Number of elements in the list
 *
 * @returns {Number}
 */
LRU.prototype.size = function()
{
	return this.elements;
};

LRU.prototype.contains = function(node)
{
	return this.items[node.id] == null;
};

/**
 * Makes node the most recently used item. if the list does not contain node, it will be added.
 *
 * @param node
 */
LRU.prototype.touch = function(node)
{
	if(!node.loaded)
	{
		return;
	}

	//If item not found add item
	if(this.items[node.id] == null)
	{
		var item = new LRUItem(node);
		item.previous = this.last;
		this.last = item;
		if(item.previous !== null)
		{
			item.previous.next = item;
		}

		this.items[node.id] = item;
		this.elements++;

		if(this.first === null)
		{
			this.first = item;
		}
		this.numPoints += node.numPoints;
	}
	//Update in the list
	else
	{
		var item = this.items[node.id];

		//Handle first element
		if(item.previous === null)
		{
			if(item.next !== null)
			{
				this.first = item.next;
				this.first.previous = null;
				item.previous = this.last;
				item.next = null;
				this.last = item;
				item.previous.next = item;
			}
		}
		//Handle last element
		else if(item.next === null){}
		//Handle any other element
		else
		{
			item.previous.next = item.next;
			item.next.previous = item.previous;
			item.previous = this.last;
			item.next = null;
			this.last = item;
			item.previous.next = item;
		}
	}
};

LRU.prototype.remove = function(node)
{
	var lruItem = this.items[node.id];

	if(lruItem)
	{
		if(this.elements === 1)
		{
			this.first = null;
			this.last = null;
		}
		else
		{
			if(!lruItem.previous)
			{
				this.first = lruItem.next;
				this.first.previous = null;
			}
			if(!lruItem.next)
			{
				this.last = lruItem.previous;
				this.last.next = null;
			}
			if(lruItem.previous && lruItem.next)
			{
				lruItem.previous.next = lruItem.next;
				lruItem.next.previous = lruItem.previous;
			}
		}

		delete this.items[node.id];
		this.elements--;
		this.numPoints -= node.numPoints;
	}
};

LRU.prototype.getLRUItem = function()
{
	if(this.first === null)
	{
		return null;
	}

	return this.first.node;
};

LRU.prototype.freeMemory = function()
{
	if(this.elements <= 1)
	{
		return;
	}

	while(this.numPoints > Potree.pointLoadLimit)
	{
		var element = this.first;
		var node = element.node;
		this.disposeDescendants(node);
	}
};

LRU.prototype.disposeDescendants = function(node)
{
	var stack = [node];

	while(stack.length > 0)
	{
		var current = stack.pop();
		current.dispose();
		this.remove(current);

		for(var key in current.children)
		{
			if(current.children.hasOwnProperty(key))
			{
				var child = current.children[key];
				if(child.loaded)
				{
					stack.push(current.children[key]);
				}
			}
		}
	}
};

LRU.prototype.toString = function()
{
	var string = "{ ";
	var curr = this.first;
	while(curr !== null)
	{
		string += curr.node.id;
		if(curr.next !== null)
		{
			string += ", ";
		}
		curr = curr.next;
	}
	string += "}";
	string += "(" + this.size() + ")";
	return string;
};
