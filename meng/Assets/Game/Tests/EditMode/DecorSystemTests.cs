using Game.Core.Model;
using Game.Core.Systems;
using NUnit.Framework;

namespace Game.Tests
{
    public class DecorSystemTests
    {
        private FakeConfig _config;
        private DecorSystem _decor;
        private SaveData _save;

        [SetUp]
        public void SetUp()
        {
            _config = new FakeConfig()
                .Add(new FakeFurniture { Id = "rug", Comfort = 8, Width = 3, Height = 2, Layer = 0, SetId = "country" })
                .Add(new FakeFurniture { Id = "sofa", Comfort = 18, Width = 2, Height = 1, Layer = 1, SetId = "country" })
                .Add(new FakeFurniture { Id = "stool", Comfort = 4, Layer = 1, SetId = "" })
                .AddTier(0, 0f, 0f)
                .AddTier(20, 0.05f, 0.05f)
                .AddTier(50, 0.12f, 0.1f);

            _decor = new DecorSystem(_config);
            _save = SaveData.CreateNew("test", 0, 6, 1000);
        }

        [Test]
        public void Place_没买过的家具不能摆()
        {
            Assert.AreEqual(PlaceError.NotOwned, _decor.Place(_save, "sofa", 0, 0, 0).Error);
        }

        [Test]
        public void Place_从收纳区摆出后收纳区减少()
        {
            _save.room.storage.Add("sofa");

            Assert.IsTrue(_decor.Place(_save, "sofa", 0, 0, 0).Ok);
            Assert.AreEqual(1, _save.room.items.Count);
            Assert.AreEqual(0, _save.room.storage.Count);
        }

        [Test]
        public void Place_越界时失败()
        {
            _save.room.storage.Add("sofa");

            Assert.AreEqual(PlaceError.OutOfBounds, _decor.Place(_save, "sofa", 9, 0, 0).Error);
        }

        [Test]
        public void Place_同层重叠时失败_跨层不冲突()
        {
            _save.room.storage.Add("sofa");
            _save.room.storage.Add("stool");
            _save.room.storage.Add("rug");

            Assert.IsTrue(_decor.Place(_save, "sofa", 0, 0, 0).Ok);
            Assert.AreEqual(PlaceError.Overlapped, _decor.Place(_save, "stool", 1, 0, 0).Error);
            Assert.IsTrue(_decor.Place(_save, "rug", 0, 0, 0).Ok, "地毯在 0 层，不该和沙发冲突");
        }

        [Test]
        public void Place_旋转后宽高互换()
        {
            _save.room.storage.Add("rug");

            // 3x2 的地毯旋转 90° 变成 2x3，放在 x=8 时横向刚好放得下
            Assert.AreEqual(PlaceError.OutOfBounds, _decor.Place(_save, "rug", 8, 0, 0).Error);
            Assert.IsTrue(_decor.Place(_save, "rug", 8, 0, 1).Ok);
        }

        [Test]
        public void Store_收回后回到收纳区且原位置空出来()
        {
            _save.room.storage.Add("sofa");
            var placed = _decor.Place(_save, "sofa", 0, 0, 0).Item;

            Assert.IsTrue(_decor.Store(_save, placed).Ok);
            Assert.AreEqual(0, _save.room.items.Count);
            Assert.Contains("sofa", _save.room.storage);
        }

        [Test]
        public void Move_可以原地旋转_不会和自己冲突()
        {
            _save.room.storage.Add("sofa");
            var placed = _decor.Place(_save, "sofa", 2, 2, 0).Item;

            Assert.IsTrue(_decor.Move(_save, placed, 2, 2, 1).Ok, "移动时应忽略自身占位");
            Assert.AreEqual(1, placed.rot);
        }

        [Test]
        public void Comfort_只算摆出来的_收纳里的不算()
        {
            _save.room.storage.Add("sofa");
            _decor.Place(_save, "sofa", 0, 0, 0);
            _save.room.storage.Add("rug");

            Assert.AreEqual(18, _decor.CalcComfort(_save.room));
        }

        [Test]
        public void Comfort_齐套时额外加两成()
        {
            _save.room.storage.Add("sofa");
            _save.room.storage.Add("rug");
            _decor.Place(_save, "sofa", 0, 0, 0);
            _decor.Place(_save, "rug", 0, 0, 0);

            // 8 + 18 = 26，country 齐套再 +20% * 26 = 5
            Assert.AreEqual(31, _decor.CalcComfort(_save.room));
        }

        [Test]
        public void Tier_取不超过当前舒适度的最高档()
        {
            Assert.AreEqual(0f, _decor.GetTier(10).sellPriceBonus);
            Assert.AreEqual(0.05f, _decor.GetTier(20).sellPriceBonus);
            Assert.AreEqual(0.12f, _decor.GetTier(999).sellPriceBonus);
        }
    }
}
