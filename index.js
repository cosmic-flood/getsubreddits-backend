const express = require("express");
const cors = require("cors");
const { chromium } = require("playwright");

const app = express();
app.use(cors());

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

app.get("/scrape/:searchValue", async (req, res) => {
  console.log(2);
  const searchValue = req.params.searchValue; // 从请求参数中获取 subreddit 名称

  try {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));

    console.log(
      `Navigating to https://anvaka.github.io/sayit/?query=${searchValue}`
    );
    await page.goto(`https://anvaka.github.io/sayit/?query=${searchValue}`, {
      timeout: 120000,
    });

    // 等待 .help 元素出现并包含特定文本
    await page.waitForFunction(
      () => {
        const helpElement = document.querySelector(".help");
        return (
          helpElement &&
          helpElement.textContent.includes("The graph of related subreddits")
        );
      },
      { timeout: 120000 }
    );

    console.log("Data collected successfully");
    await sleep(3000);

    // 在页面环境中执行的函数，获取 Reddit API 数据
    const apiResponse = await page.evaluate(async (searchValue) => {
      try {
        const zz = await fetch(`https://api.reddit.com/r/${searchValue}/hot`, {
          method: "GET",
          headers: {
            accept: "application/json, text/plain, */*",
            "user-agent": navigator.userAgent,
          },
        });

        const zzz = await zz.json();
        let arr = [];
        zzz.data.children.forEach((e) => {
          if (arr.length < 5) {
            arr.push(e.data.secure_media?.reddit_video?.fallback_url);
          }
        });

        const response = await fetch(
          `https://api.reddit.com/r/${searchValue}/about`,
          {
            method: "GET",
            headers: {
              accept: "application/json, text/plain, */*",
              "user-agent": navigator.userAgent,
            },
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log(arr);
        data.data.arr = arr;
        return data.data;
      } catch (error) {
        console.error("Error fetching API:", error.message);
        return null;
      }
    }, searchValue);

    // 初始化数据对象
    let demo = {
      Members: 0,
      description: "",
      description_html: "",
      id: "",
      arr: [],
    };

    if (apiResponse) {
      if (apiResponse.subscribers) {
        demo.Members = apiResponse.subscribers;
        demo.description = apiResponse.description;
        demo.description_html = apiResponse.description_html;
        demo.id = apiResponse.id;
        demo.arr = apiResponse.arr;
      }
    } else {
      console.log("Failed to fetch API data.");
    }

    // 收集页面数据
    const subredditData = await page.evaluate((demo) => {
      const data = [];
      const elements = document.querySelectorAll("#nodes g");

      elements.forEach((el) => {
        const textElement = el.querySelector("text");
        const textContent = textElement ? textElement.textContent.trim() : "";
        let hover = "";
        let subredditName = " ";
        let subredditLink = "https://www.reddit.com/r/";

        if (el.classList.contains("hovered")) {
          hover = textContent;
          subredditLink = "https://www.reddit.com/r/" + hover;
        } else {
          subredditName = textContent;
          subredditLink = "https://www.reddit.com/r/" + subredditName;
        }

        const members = demo.Members;
        const subredditIntro = demo.description;
        const subredditRules = demo.description_html;
        const moderatorIds = demo.id;
        const topPosts = demo.arr;

        data.push({
          hover,
          subredditName,
          subredditLink,
          members,
          subredditIntro,
          subredditRules,
          moderatorIds,
          topPosts,
        });
      });

      return data;
    }, demo);

    await browser.close();

    // 返回 JSON 响应
    res.json({ message: "Data fetched successfully!", data: subredditData });
  } catch (error) {
    console.error("Error scraping data:", error);
    res
      .status(500)
      .json({ message: "Error scraping data", error: error.message });
  }
});

// 服务器监听端口
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
