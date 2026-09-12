using System;
using System.Collections.Generic;

namespace Game.Core.Model
{
    [Serializable]
    public class InventoryState
    {
        public List<ItemStack> stacks = new List<ItemStack>();

        public int Count(string itemId)
        {
            var index = IndexOf(itemId);
            return index < 0 ? 0 : stacks[index].count;
        }

        public void Add(string itemId, int count)
        {
            if (string.IsNullOrEmpty(itemId) || count <= 0) return;

            var index = IndexOf(itemId);
            if (index < 0)
            {
                stacks.Add(new ItemStack { id = itemId, count = count });
                return;
            }

            stacks[index].count += count;
        }

        public bool TryRemove(string itemId, int count)
        {
            if (count <= 0) return false;

            var index = IndexOf(itemId);
            if (index < 0 || stacks[index].count < count) return false;

            stacks[index].count -= count;
            if (stacks[index].count == 0) stacks.RemoveAt(index);
            return true;
        }

        private int IndexOf(string itemId)
        {
            for (var i = 0; i < stacks.Count; i++)
            {
                if (stacks[i].id == itemId) return i;
            }

            return -1;
        }
    }

    [Serializable]
    public class ItemStack
    {
        public string id;
        public int count;
    }
}
