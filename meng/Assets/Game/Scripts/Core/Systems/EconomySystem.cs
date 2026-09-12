using System;
using Game.Core.Defs;
using Game.Core.Model;

namespace Game.Core.Systems
{
    public enum ShopError
    {
        None = 0,
        UnknownItem = 1,
        LevelTooLow = 2,
        NotEnoughCoin = 3,
        NotEnoughItem = 4,
        NotSellable = 5,
    }

    public readonly struct ShopResult
    {
        public readonly ShopError Error;
        public readonly int CoinDelta;

        public ShopResult(ShopError error, int coinDelta = 0)
        {
            Error = error;
            CoinDelta = coinDelta;
        }

        public bool Ok => Error == ShopError.None;

        public static ShopResult Fail(ShopError error) => new ShopResult(error);
    }

    /// <summary>买卖与升级。售价加成来自舒适度档位——装修越好，卖得越贵。</summary>
    public sealed class EconomySystem
    {
        private readonly IGameConfig _config;
        private readonly DecorSystem _decor;

        public EconomySystem(IGameConfig config, DecorSystem decor)
        {
            _config = config;
            _decor = decor;
        }

        /// <summary>作物/产物的实际售价，已含舒适度加成。UI 上要把加成单独显示出来，玩家才感知得到装修的价值。</summary>
        public int GetSellPrice(SaveData save, string itemId)
        {
            var basePrice = GetBaseSellPrice(itemId);
            if (basePrice <= 0) return 0;

            var bonus = _decor.GetTier(save).sellPriceBonus;
            return Math.Max(1, (int)Math.Round(basePrice * (1f + bonus)));
        }

        public int GetBaseSellPrice(string itemId)
        {
            var crop = _config.GetCrop(itemId);
            if (crop != null) return crop.SellPrice;

            var item = _config.GetItem(itemId);
            return item?.SellPrice ?? 0;
        }

        public ShopResult Sell(SaveData save, string itemId, int count)
        {
            if (count <= 0) return ShopResult.Fail(ShopError.NotEnoughItem);

            var unit = GetSellPrice(save, itemId);
            if (unit <= 0) return ShopResult.Fail(ShopError.NotSellable);
            if (!save.inventory.TryRemove(itemId, count)) return ShopResult.Fail(ShopError.NotEnoughItem);

            var total = unit * count;
            save.wallet.Add(CurrencyType.Coin, total);
            return new ShopResult(ShopError.None, total);
        }

        /// <summary>买家具。买到的直接进收纳区，摆放是 DecorSystem 的事。</summary>
        public ShopResult BuyFurniture(SaveData save, string defId)
        {
            var def = _config.GetFurniture(defId);
            if (def == null) return ShopResult.Fail(ShopError.UnknownItem);
            if (save.level < def.UnlockLevel) return ShopResult.Fail(ShopError.LevelTooLow);
            if (!save.wallet.TrySpend(CurrencyType.Coin, def.Price)) return ShopResult.Fail(ShopError.NotEnoughCoin);

            save.room.storage.Add(def.Id);
            return new ShopResult(ShopError.None, -def.Price);
        }

        /// <summary>加经验，可能连升多级。返回升了几级，0 表示没升。</summary>
        public int AddExp(SaveData save, int exp)
        {
            if (exp <= 0) return 0;

            save.exp += exp;
            var levelsGained = 0;

            while (save.level < _config.MaxLevel)
            {
                var need = _config.ExpToNextLevel(save.level);
                if (need <= 0 || save.exp < need) break;

                save.exp -= need;
                save.level++;
                levelsGained++;
            }

            if (save.level >= _config.MaxLevel) save.exp = 0;
            return levelsGained;
        }
    }
}
