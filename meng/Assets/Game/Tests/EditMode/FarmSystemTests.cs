using Game.Core.Model;
using Game.Core.Systems;
using NUnit.Framework;

namespace Game.Tests
{
    public class FarmSystemTests
    {
        private FakeTimeService _time;
        private FakeConfig _config;
        private DecorSystem _decor;
        private FarmSystem _farm;
        private SaveData _save;

        [SetUp]
        public void SetUp()
        {
            _time = new FakeTimeService();
            _config = new FakeConfig()
                .Add(new FakeCrop { Id = "radish", GrowSeconds = 300, SeedPrice = 10, SellPrice = 25, Exp = 3 })
                .Add(new FakeCrop { Id = "pumpkin", GrowSeconds = 28800, SeedPrice = 300, UnlockLevel = 11 })
                .Add(new FakeAnimal { Id = "chicken", FeedItemId = "corn", FeedCount = 1, ProduceSeconds = 1800 });

            _decor = new DecorSystem(_config);
            _farm = new FarmSystem(_config, _time, _decor);
            _save = SaveData.CreateNew("test", _time.NowUtc, 6, 1000);
        }

        [Test]
        public void Plant_扣种子钱并占用地块()
        {
            var result = _farm.Plant(_save, 0, "radish");

            Assert.IsTrue(result.Ok);
            Assert.AreEqual(990, _save.wallet.coin);
            Assert.AreEqual("radish", _save.farm.GetPlot(0).cropId);
        }

        [Test]
        public void Plant_钱不够时失败且不改状态()
        {
            _save.wallet.coin = 5;

            var result = _farm.Plant(_save, 0, "radish");

            Assert.AreEqual(FarmError.NotEnoughCoin, result.Error);
            Assert.AreEqual(5, _save.wallet.coin);
            Assert.IsTrue(_save.farm.GetPlot(0).IsEmpty);
        }

        [Test]
        public void Plant_等级不够时失败()
        {
            _save.level = 3;

            Assert.AreEqual(FarmError.LevelTooLow, _farm.Plant(_save, 0, "pumpkin").Error);
        }

        [Test]
        public void Plant_已种过的地块不能重复种()
        {
            _farm.Plant(_save, 0, "radish");

            Assert.AreEqual(FarmError.PlotOccupied, _farm.Plant(_save, 0, "radish").Error);
        }

        [Test]
        public void Growth_时间没到不算成熟()
        {
            _farm.Plant(_save, 0, "radish");
            _time.Advance(299);

            var info = _farm.GetGrowth(_save.farm.GetPlot(0));

            Assert.IsFalse(info.Ripe);
            Assert.AreEqual(1, info.RemainingSeconds);
        }

        [Test]
        public void Growth_时间到了就成熟()
        {
            _farm.Plant(_save, 0, "radish");
            _time.Advance(300);

            Assert.IsTrue(_farm.GetGrowth(_save.farm.GetPlot(0)).Ripe);
        }

        [Test]
        public void Growth_客户端时间倒流不会变成负进度()
        {
            _farm.Plant(_save, 0, "radish");
            _time.NowUtc -= 10_000;

            var info = _farm.GetGrowth(_save.farm.GetPlot(0));

            Assert.IsFalse(info.Ripe);
            Assert.AreEqual(0f, info.Progress);
        }

        [Test]
        public void Water_减免一成时间且只能浇一次()
        {
            _farm.Plant(_save, 0, "radish");

            Assert.IsTrue(_farm.Water(_save, 0).Ok);
            Assert.AreEqual(30, _save.farm.GetPlot(0).waterBonusSeconds);
            Assert.AreEqual(FarmError.AlreadyWatered, _farm.Water(_save, 0).Error);

            _time.Advance(270);
            Assert.IsTrue(_farm.GetGrowth(_save.farm.GetPlot(0)).Ripe);
        }

        [Test]
        public void Harvest_没熟时不给收()
        {
            _farm.Plant(_save, 0, "radish");
            _time.Advance(100);

            Assert.AreEqual(FarmError.NotRipe, _farm.Harvest(_save, 0).Error);
        }

        [Test]
        public void Harvest_进背包并清空地块()
        {
            _farm.Plant(_save, 0, "radish");
            _time.Advance(300);

            var result = _farm.Harvest(_save, 0);

            Assert.IsTrue(result.Ok);
            Assert.AreEqual(3, result.Exp);
            Assert.AreEqual(1, _save.inventory.Count("radish"));
            Assert.IsTrue(_save.farm.GetPlot(0).IsEmpty);
        }

        [Test]
        public void 舒适度加速在播种时锁定_装修后不追溯已种作物()
        {
            _config.Add(new FakeFurniture { Id = "sofa", Comfort = 100 }).AddTier(0, 0f, 0f).AddTier(50, 0.1f, 0.2f);

            _farm.Plant(_save, 0, "radish");
            Assert.AreEqual(300, _save.farm.GetPlot(0).growSeconds);

            // 种下之后再装修
            _save.room.items.Add(new PlacedItem("sofa", 0, 0, 0, 1));

            Assert.AreEqual(300, _save.farm.GetPlot(0).growSeconds, "已种下的作物不应被追溯加速");

            _time.Advance(300);
            _farm.Harvest(_save, 0);
            _farm.Plant(_save, 0, "radish");

            Assert.AreEqual(240, _save.farm.GetPlot(0).growSeconds, "新种下的作物才享受 20% 加速");
        }

        [Test]
        public void Feed_没饲料时失败()
        {
            _save.farm.barns.Add(new BarnState { id = "coop", animalId = "chicken" });

            Assert.AreEqual(FarmError.NotEnoughFeed, _farm.Feed(_save, "coop").Error);
        }

        [Test]
        public void Collect_投喂满时长后产出并清空投喂状态()
        {
            _save.farm.barns.Add(new BarnState { id = "coop", animalId = "chicken" });
            _save.inventory.Add("corn", 1);

            Assert.IsTrue(_farm.Feed(_save, "coop").Ok);
            Assert.AreEqual(FarmError.NotReady, _farm.Collect(_save, "coop").Error);

            _time.Advance(1800);
            var result = _farm.Collect(_save, "coop");

            Assert.IsTrue(result.Ok);
            Assert.AreEqual(1, _save.inventory.Count("egg"));
            Assert.AreEqual(1, _save.farm.GetBarn("coop").intimacy);
            Assert.IsFalse(_save.farm.GetBarn("coop").IsFed);
        }
    }
}
