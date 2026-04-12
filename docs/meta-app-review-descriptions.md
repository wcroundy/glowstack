# Meta App Review — Permission Descriptions

## 1. read_insights

GlowStack is a media asset management and social analytics platform built for beauty and fashion content creators. We use the read_insights permission to retrieve engagement and performance metrics for posts published on a user's Facebook Page.

When a creator connects their Facebook Page through our OAuth flow, GlowStack syncs their Page posts and displays performance data in our Social Insights dashboard. Specifically, we use read_insights to fetch post-level metrics including impressions, reach, engagement, clicks, and reaction breakdowns via the /{post-id}/insights endpoint and page-level metrics via the /{page-id}/insights endpoint.

This data is displayed in a table view where creators can see each post's performance at a glance, along with aggregated summary cards showing total impressions, reach, engagement, and clicks across all their content. Creators use this to identify which posts resonate with their audience and inform their content strategy.

The data is only accessible to the authenticated account owner within GlowStack. We do not share, sell, or transfer this data to any third parties.


## 2. pages_read_user_content

GlowStack uses pages_read_user_content to read the content of posts published on a creator's Facebook Page, including post text, images, timestamps, and permalink URLs.

When a creator connects their Facebook Page and initiates a sync, GlowStack fetches all published posts via the /{page-id}/feed endpoint and stores them in our database. This content is displayed in the Social Insights dashboard's Facebook tab, where creators can browse their full post history with thumbnails, captions, publication dates, and direct links back to the original posts on Facebook.

This allows creators to review their entire content library alongside performance metrics in a single unified interface, rather than navigating through Facebook's native Page tools. The content is only visible to the authenticated account owner.


## 3. instagram_basic

GlowStack uses instagram_basic to read an Instagram Business account's profile information and published media. When a creator connects their account through our Facebook Login OAuth flow, we use this permission to:

1. Retrieve the Instagram Business account linked to their Facebook Page via the /{page-id}?fields=instagram_business_account endpoint
2. Fetch profile details including username, display name, biography, profile picture, and follower/following counts via the /{ig-user-id} endpoint
3. Retrieve published media (posts, reels, carousels) with metadata including media type, caption, permalink, timestamp, like count, and comment count via the /{ig-user-id}/media endpoint

This data powers our Social Insights dashboard's Instagram tab, where creators can see their connected account information, browse their full post history with media type badges (Reel, Carousel, Image), and view basic engagement metrics like likes and comments. The profile information is also displayed in the connection status card so creators can verify which account is linked.

All data is only accessible to the authenticated account owner within GlowStack.


## 4. instagram_manage_insights

GlowStack uses instagram_manage_insights to fetch detailed per-post performance metrics for content published on a creator's Instagram Business account. This permission enables us to call the /{media-id}/insights endpoint to retrieve metrics that are not available through basic media fields, specifically:

- Impressions (total number of times the content was displayed)
- Reach (unique accounts that saw the content)
- Saves (number of times the content was saved)
- Shares (number of times the content was shared)
- Plays (for video/Reel content)

These metrics are displayed alongside each post in our Social Insights dashboard's Instagram tab, giving creators a comprehensive view of how their content performs beyond just likes and comments. We also aggregate these metrics into summary cards showing total impressions, reach, saves, shares, and plays across all content, plus an average engagement rate calculation.

This data helps beauty and fashion creators understand which types of content (outfit posts, tutorials, product reviews, etc.) drive the most engagement, informing their content strategy and brand partnership decisions. The insights data is only accessible to the authenticated account owner and is not shared with any third parties.
