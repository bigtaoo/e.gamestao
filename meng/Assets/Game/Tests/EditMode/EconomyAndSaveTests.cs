using System;
using Game.Core.Model;
using Game.Core.Save;
using Game.Core.Systems;
using NUnit.Framework;

namespace Game.Tests
{
    public class EconomySystemTests
    {
        private FakeConfig _config;
        private DecorSystem _decor;
        private EconomySystem _economy;
        private SaveData _save;

        [SetUp]
        public void SetUp()
        {
            _config = new FakeConfig()
                .Add(new FakeCrop { Id = "radish", SellPrice = 25 })
                .Add(new FakeItem { Id = "egg", SellPrice = 40 })
                .Add(new FakeFurniture { Id = "sofa", Price = 260, Comfort = 60, UnlockLevel = 1 })
                .AddTier(0, 0f, 0f)
                .AddTier(50, 0.2f, 0f);

            _decor = new DecorSystem(_config);
            _economy = new EconomySystem(_config, _decor);
            _save = SaveData.CreateNew("test", 0, 6, 1000);
        }

        [Test]
        public void Sell_背包不够时不扣不加()
        {
            _save.inventory.Add("radish", 1);

            Assert.AreEqual(ShopError.NotEnoughItem, _economy.Sell(_save, "radish", 2).Error);
            Assert.AreEqual(1000, _save.wallet.coin);
            Assert.AreEqual(1, _save.inventory.Count("radish"));
        }

        [Test]
        public void Sell_按基础价结算()
        {
            _save.inventory.Add("radish", 4);

            var result = _economy.Sell(_save, "radish", 4);

            Assert.IsTrue(result.Ok);
            Assert.AreEqual(100, result.CoinDelta);
            Assert.AreEqual(1100, _save.wallet.coin);
        }

        [Test]
        public void Sell_舒适度达标时售价提高()
        {
            _save.room.items.Add(new PlacedItem("sofa", 0, 0, 0, 1));
            _save.inventory.Add("radish", 1);

            Assert.AreEqual(30, _economy.GetSellPrice(_save, "radish"), "25 * 1.2 = 30");
            Assert.IsTrue(_economy.Sell(_save, "radish", 1).Ok);
            Assert.AreEqual(1030, _save.wallet.coin);
        }

        [Test]
        public void BuyFurniture_买到的进收纳区()
        {
            Assert.IsTrue(_economy.BuyFurniture(_save, "sofa").Ok);
            Assert.AreEqual(740, _save.wallet.coin);
            Assert.Contains("sofa", _save.room.storage);
        }

        [Test]
        public void BuyFurniture_钱不够时失败()
        {
            _save.wallet.coin = 10;

            Assert.AreEqual(ShopError.NotEnoughCoin, _economy.BuyFurniture(_save, "sofa").Error);
            Assert.AreEqual(0, _save.room.storage.Count);
        }

        [Test]
        public void AddExp_可以一次连升多级()
        {
            var gained = _economy.AddExp(_save, 250);

            Assert.AreEqual(2, gained);
            Assert.AreEqual(3, _save.level);
            Assert.AreEqual(50, _save.exp);
        }

        [Test]
        public void AddExp_满级后不再涨()
        {
            _config.MaxLevel = 2;

            _economy.AddExp(_save, 10_000);

            Assert.AreEqual(2, _save.level);
            Assert.AreEqual(0, _save.exp);
        }
    }

    public class SaveMigratorTests
    {
        [Test]
        public void 当前版本不需要迁移()
        {
            var save = SaveData.CreateNew("test", 0, 6, 100);

            Assert.IsFalse(SaveMigrator.NeedsMigration(save.schemaVersion));
            Assert.AreSame(save, SaveMigrator.Migrate(save));
        }

        [Test]
        public void 缺迁移步骤时立刻报错而不是静默带坏数据()
        {
            var save = SaveData.CreateNew("test", 0, 6, 100);
            save.schemaVersion = 0;

            Assert.Throws<InvalidOperationException>(() => SaveMigrator.Migrate(save));
        }
    }

    public class InventoryTests
    {
        [Test]
        public void 数量归零时移除条目()
        {
            var inventory = new InventoryState();
            inventory.Add("radish", 2);

            Assert.IsTrue(inventory.TryRemove("radish", 2));
            Assert.AreEqual(0, inventory.stacks.Count);
        }

        [Test]
        public void 不足时不扣()
        {
            var inventory = new InventoryState();
            inventory.Add("radish", 1);

            Assert.IsFalse(inventory.TryRemove("radish", 2));
            Assert.AreEqual(1, inventory.Count("radish"));
        }
    }

    public class GridMapTests
    {
        [Test]
        public void 边界外一律不可放()
        {
            var grid = new GridMap(4, 4);

            Assert.IsFalse(grid.IsInside(-1, 0, 1, 1));
            Assert.IsFalse(grid.IsInside(3, 3, 2, 2));
            Assert.IsTrue(grid.IsInside(2, 2, 2, 2));
        }

        [Test]
        public void 占用后同层不可放_不同层可放()
        {
            var grid = new GridMap(4, 4);
            grid.Occupy(1, 0, 0, 2, 2);

            Assert.IsFalse(grid.IsFree(1, 1, 1, 1, 1));
            Assert.IsTrue(grid.IsFree(0, 1, 1, 1, 1));
            Assert.IsTrue(grid.IsFree(1, 2, 2, 2, 2));
        }

        [Test]
        public void 释放后恢复可放()
        {
            var grid = new GridMap(4, 4);
            grid.Occupy(1, 0, 0, 2, 2);
            grid.Free(1, 0, 0, 2, 2);

            Assert.IsTrue(grid.IsFree(1, 0, 0, 2, 2));
        }

        [Test]
        public void 旋转奇数次宽高互换()
        {
            GridMap.GetFootprint(3, 2, 0, out var w0, out var h0);
            GridMap.GetFootprint(3, 2, 1, out var w1, out var h1);

            Assert.AreEqual((3, 2), (w0, h0));
            Assert.AreEqual((2, 3), (w1, h1));
        }
    }
}
