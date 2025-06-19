import {IPointCloudTreeNode} from '../types';

export type Node = IPointCloudTreeNode;

export class LRUItem 
{
	next: LRUItem | null = null;

	previous: LRUItem | null = null;

	constructor(public node: Node) {}
}

/**
 * A doubly-linked-list of the least recently used elements.
 */
export class LRU 
{
	/**
	 * The least recently used item.
	 */
	public first: LRUItem | null = null;

	/**
	 * The most recently used item
	 */
	public last: LRUItem | null = null;

	/**
	 * The total number of points in the LRU cache.
	 */
	public numPoints: number = 0;

	/**
	 * Items in the LRU cache, indexed by node ID.
	 */
	private items = new Map<number, LRUItem>();
	
	/**
	 * Creates a new LRU cache with a specified point budget.
	 * 
	 * @param pointBudget The maximum number of points that can be stored in the LRU cache.
	 */
	public constructor(public pointBudget: number = 1_000_000) {}

	public get size(): number 
	{
		return this.items.size;
	}

	/**
	 * Checks if the LRU cache contains the specified node.
	 * 
	 * @param node - The node to check for in the LRU cache.
	 * @returns Returns true if the node is in the cache, false otherwise.
	 */
	public has(node: Node): boolean 
	{
		return this.items.has(node.id);
	}

	/**
	 * Makes the specified the most recently used item. if the list does not contain node, it will be added.
	 * 
	 * @param node - The node to touch, making it the most recently used item in the LRU cache.
	 */
	public touch(node: Node) 
	{
		if (!node.loaded) 
		{
			return;
		}

		const item = this.items.get(node.id);
		if (item) 
		{
			this.touchExisting(item);
		}
		else 
		{
			this.addNew(node);
		}
	}

	/**
	 * Adds a new node to the LRU cache, making it the most recently used item.
	 * 
	 * @param node - The node to add to the LRU cache.
	 */
	private addNew(node: Node): void 
	{
		const item = new LRUItem(node);
		item.previous = this.last;
		this.last = item;
		if (item.previous) 
		{
			item.previous.next = item;
		}

		if (!this.first) 
		{
			this.first = item;
		}

		this.items.set(node.id, item);
		this.numPoints += node.numPoints;
	}

	/**
	 * Touches an existing item in the LRU cache, moving it to the end of the list (most recently used).
	 * 
	 * @param item - The LRUItem to touch, making it the most recently used item in the cache.
	 */
	private touchExisting(item: LRUItem): void 
	{
		if (!item.previous) 
		{
			// handle touch on first element
			if (item.next) 
			{
				this.first = item.next;
				this.first.previous = null;
				item.previous = this.last;
				item.next = null;
				this.last = item;

				if (item.previous) 
				{
					item.previous.next = item;
				}
			}
		}
		else if (!item.next) 
		{
			// handle touch on last element
		}
		else 
		{
			// handle touch on any other element
			item.previous.next = item.next;
			item.next.previous = item.previous;
			item.previous = this.last;
			item.next = null;
			this.last = item;

			if (item.previous) 
			{
				item.previous.next = item;
			}
		}
	}

	/**
	 * Removes a node from the LRU cache.
	 * 
	 * @param node - The node to remove from the LRU cache.
	 */
	public remove(node: Node) 
	{
		const item = this.items.get(node.id);
		if (!item) 
		{
			return;
		}

		if (this.items.size === 1) 
		{
			this.first = null;
			this.last = null;
		}
		else 
		{
			if (!item.previous) 
			{
				this.first = item.next;
				this.first!.previous = null;
			}

			if (!item.next) 
			{
				this.last = item.previous;
				this.last!.next = null;
			}

			if (item.previous && item.next) 
			{
				item.previous.next = item.next;
				item.next.previous = item.previous;
			}
		}

		this.items.delete(node.id);
		this.numPoints -= node.numPoints;
	}

	/**
	 * Gets the least recently used item from the LRU cache.
	 * 
	 * @returns Returns the least recently used node, or undefined if the cache is empty. 
	 */
	public getLRUItem(): Node | undefined 
	{
		return this.first ? this.first.node : undefined;
	}

	/**
	 * Frees up memory by removing the least recently used items until the number of points is below the point budget.
	 * 
	 * @returns - Returns nothing.
	 */
	public freeMemory(): void 
	{
		if (this.items.size <= 1) 
		{
			return;
		}

		while (this.numPoints > this.pointBudget * 2) 
		{
			const node = this.getLRUItem();
			if (node) 
			{
				this.disposeSubtree(node);
			}
		}
	}

	/**
	 * Disposes of a subtree starting from the specified node and removes it from the LRU cache.
	 * 
	 * @param node - The root node of the subtree to dispose of.
	 */
	public disposeSubtree(node: Node): void 
	{
		// Collect all the nodes which are to be disposed and removed.
		const nodesToDispose: Node[] = [node];
		node.traverse((n) => 
		{
			if (n.loaded) 
			{
				nodesToDispose.push(n);
			}
		});

		// Dispose of all the nodes in one go.
		for (const n of nodesToDispose) 
		{
			n.dispose();
			this.remove(n);
		}
	}
}
