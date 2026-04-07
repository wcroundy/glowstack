import React from 'react';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">Last updated: April 6, 2026</p>

        <div className="prose dark:prose-invert max-w-none space-y-6 text-gray-700 dark:text-gray-300">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mt-8 mb-3">1. Introduction</h2>
            <p>
              GlowStack ("we", "our", or "us") operates the GlowStack platform at glowstack.net. This Privacy Policy
              explains how we collect, use, disclose, and safeguard your information when you use our service, including
              data obtained through third-party platform integrations such as Meta (Facebook and Instagram), TikTok,
              and Google.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mt-8 mb-3">2. Information We Collect</h2>
            <p><strong>Account Information:</strong> When you create an account, we collect your name, email address, and authentication credentials.</p>
            <p><strong>Social Media Data:</strong> When you connect your social media accounts (Facebook, Instagram, TikTok), we access and store:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Public profile information (username, profile picture, follower counts)</li>
              <li>Posts, media content, and captions you have published</li>
              <li>Engagement metrics (likes, comments, shares, impressions, reach)</li>
              <li>Page and account insights data</li>
            </ul>
            <p><strong>Media Assets:</strong> Images, videos, and associated metadata that you upload to GlowStack.</p>
            <p><strong>Usage Data:</strong> Information about how you interact with our platform, including features used and actions taken.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mt-8 mb-3">3. How We Use Your Information</h2>
            <p>We use the collected information to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Provide and maintain the GlowStack platform</li>
              <li>Analyze your social media performance and generate insights</li>
              <li>Organize and tag your media assets using AI-powered tools</li>
              <li>Display engagement metrics and content analytics dashboards</li>
              <li>Improve our services and develop new features</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mt-8 mb-3">4. Meta Platform Data</h2>
            <p>
              When you connect your Facebook Page or Instagram Business Account, we access data through the
              Meta Graph API. This includes:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Facebook Page posts, engagement data, and page insights</li>
              <li>Instagram media, captions, engagement metrics, and account insights</li>
              <li>Profile information for connected business accounts</li>
            </ul>
            <p>
              We do not sell, share, or transfer Meta platform data to third parties, except as necessary
              to provide our services. Meta platform data is used solely for displaying analytics and insights
              within the GlowStack platform to the account owner.
            </p>
            <p>
              We retain Meta platform data for as long as your account is active and the social media connection
              is maintained. You may disconnect your Meta account at any time through the GlowStack settings page,
              which will stop further data collection. You may also request complete deletion of your data.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mt-8 mb-3">5. Data Storage and Security</h2>
            <p>
              Your data is stored securely using Supabase (PostgreSQL) with encryption at rest and in transit.
              Access tokens are stored securely and refreshed automatically. We implement industry-standard
              security measures to protect your data from unauthorized access, alteration, or destruction.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mt-8 mb-3">6. Data Sharing</h2>
            <p>We do not sell your personal information. We may share data with:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Service Providers:</strong> Third-party services that help us operate our platform (hosting, database, AI processing)</li>
              <li><strong>Legal Requirements:</strong> When required by law, regulation, or legal process</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mt-8 mb-3">7. Data Deletion</h2>
            <p>
              You have the right to request deletion of your data at any time. You can:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Disconnect social media accounts through the Settings page to stop data collection</li>
              <li>Request complete account and data deletion by contacting us</li>
              <li>Use Meta's data deletion controls, which will trigger automatic deletion of your Meta-related data from our systems</li>
            </ul>
            <p>
              When you request data deletion through Meta, we process the request within 24 hours and provide
              a confirmation code for tracking.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mt-8 mb-3">8. Your Rights</h2>
            <p>Depending on your jurisdiction, you may have the right to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Access the personal data we hold about you</li>
              <li>Correct inaccurate or incomplete data</li>
              <li>Request deletion of your data</li>
              <li>Restrict or object to data processing</li>
              <li>Data portability</li>
              <li>Withdraw consent at any time</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mt-8 mb-3">9. Contact Us</h2>
            <p>
              If you have questions about this Privacy Policy or wish to exercise your data rights,
              please contact us at: <a href="mailto:privacy@glowstack.net" className="text-pink-600 dark:text-pink-400 hover:underline">privacy@glowstack.net</a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
