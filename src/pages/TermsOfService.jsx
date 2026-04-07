import React from 'react';

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">Last updated: April 6, 2026</p>

        <div className="prose dark:prose-invert max-w-none space-y-6 text-gray-700 dark:text-gray-300">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mt-8 mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing or using GlowStack ("the Service"), operated at glowstack.net, you agree to be bound by
              these Terms of Service. If you do not agree to these terms, please do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mt-8 mb-3">2. Description of Service</h2>
            <p>
              GlowStack is an AI-driven media asset management and social media analytics platform designed for
              content creators and influencers. The Service provides tools for organizing media assets, analyzing
              social media performance, and managing content across platforms including Facebook, Instagram, and TikTok.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mt-8 mb-3">3. User Accounts</h2>
            <p>
              You are responsible for maintaining the confidentiality of your account credentials and for all
              activities that occur under your account. You must notify us immediately of any unauthorized use
              of your account.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mt-8 mb-3">4. Third-Party Platform Integrations</h2>
            <p>
              The Service integrates with third-party platforms including Meta (Facebook and Instagram), TikTok,
              and Google. By connecting these accounts, you:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Authorize GlowStack to access your data on those platforms as described in our Privacy Policy</li>
              <li>Agree to comply with the terms of service of those third-party platforms</li>
              <li>Acknowledge that the availability and functionality of integrations depends on the third-party platform APIs</li>
              <li>Understand you can disconnect any integration at any time through the Settings page</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mt-8 mb-3">5. Acceptable Use</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Use the Service for any illegal or unauthorized purpose</li>
              <li>Violate any laws or regulations in your jurisdiction</li>
              <li>Attempt to access other users' accounts or data</li>
              <li>Interfere with or disrupt the Service or its infrastructure</li>
              <li>Use automated means to access the Service beyond its intended functionality</li>
              <li>Upload content that infringes on intellectual property rights</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mt-8 mb-3">6. Intellectual Property</h2>
            <p>
              You retain ownership of all content you upload to GlowStack. By using the Service, you grant us a
              limited license to process, analyze, and display your content solely for the purpose of providing
              the Service to you. We do not claim ownership of your content.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mt-8 mb-3">7. Service Availability</h2>
            <p>
              We strive to maintain high availability of the Service but do not guarantee uninterrupted access.
              We may modify, suspend, or discontinue any part of the Service at any time with reasonable notice.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mt-8 mb-3">8. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, GlowStack shall not be liable for any indirect, incidental,
              special, consequential, or punitive damages arising from your use of or inability to use the Service,
              including any loss of data or business opportunities.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mt-8 mb-3">9. Termination</h2>
            <p>
              We reserve the right to suspend or terminate your account at any time for violation of these terms.
              You may terminate your account at any time by contacting us. Upon termination, your data will be
              deleted in accordance with our Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mt-8 mb-3">10. Changes to Terms</h2>
            <p>
              We may update these Terms of Service from time to time. We will notify you of significant changes
              via email or through the Service. Continued use of the Service after changes constitutes acceptance
              of the new terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mt-8 mb-3">11. Contact</h2>
            <p>
              For questions about these Terms, contact us at: <a href="mailto:legal@glowstack.net" className="text-pink-600 dark:text-pink-400 hover:underline">legal@glowstack.net</a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
