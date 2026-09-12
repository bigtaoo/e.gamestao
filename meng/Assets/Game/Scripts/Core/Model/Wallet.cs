using System;

namespace Game.Core.Model
{
    [Serializable]
    public class Wallet
    {
        public int coin;
        public int gem;
        public int friendPoint;

        public bool CanAfford(CurrencyType type, int amount) => Get(type) >= amount;

        public int Get(CurrencyType type)
        {
            switch (type)
            {
                case CurrencyType.Coin: return coin;
                case CurrencyType.Gem: return gem;
                case CurrencyType.FriendPoint: return friendPoint;
                default: return 0;
            }
        }

        public void Add(CurrencyType type, int amount)
        {
            switch (type)
            {
                case CurrencyType.Coin:
                    coin = SafeAdd(coin, amount);
                    break;
                case CurrencyType.Gem:
                    gem = SafeAdd(gem, amount);
                    break;
                case CurrencyType.FriendPoint:
                    friendPoint = SafeAdd(friendPoint, amount);
                    break;
            }
        }

        public bool TrySpend(CurrencyType type, int amount)
        {
            if (amount < 0 || !CanAfford(type, amount)) return false;
            Add(type, -amount);
            return true;
        }

        private static int SafeAdd(int current, int delta)
        {
            var result = (long)current + delta;
            if (result < 0) result = 0;
            if (result > int.MaxValue) result = int.MaxValue;
            return (int)result;
        }
    }

    public enum CurrencyType
    {
        Coin = 0,
        Gem = 1,
        FriendPoint = 2,
    }
}
