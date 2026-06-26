import React from 'react';
import { useNavigate } from 'react-router-dom';

const TermsPage: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center bg-white min-h-screen py-12 px-4">
      <div className="max-w-[900px] w-full space-y-6">
        <h1 className="text-4xl font-bold text-black mb-4">Terms of Service</h1>
        <p className="text-lg text-gray-700 mb-6">
          Please read these terms carefully before using SpendWise Pro.
        </p>
        {/* 1. Acceptance of Terms */}
        <section>
          <h2 className="text-2xl font-semibold text-black mt-8">1. Acceptance of Terms</h2>
          <p className="mt-2 text-gray-700">By accessing or using SpendWise Pro, you agree to be bound by these Terms of Service.</p>
        </section>
        {/* 2. Eligibility */}
        <section>
          <h2 className="text-2xl font-semibold text-black mt-8">2. Eligibility</h2>
          <p className="mt-2 text-gray-700">You must be at least 13 years old and have the legal capacity to enter into a binding agreement.</p>
        </section>
        {/* 3. User Responsibilities */}
        <section>
          <h2 className="text-2xl font-semibold text-black mt-8">3. User Responsibilities</h2>
          <ul className="list-disc list-inside mt-2 text-gray-700 space-y-1">
            <li>Provide accurate information</li>
            <li>Keep credentials secure</li>
            <li>Do not misuse the platform</li>
            <li>Do not attempt unauthorized access</li>
          </ul>
        </section>
        {/* 4. Financial Disclaimer */}
        <section>
          <h2 className="text-2xl font-semibold text-black mt-8">4. Financial Disclaimer</h2>
          <p className="mt-2 text-gray-700">
            SpendWise Pro provides budgeting, analytics and AI‑powered financial insights. It does NOT provide legal, tax or financial advice. Users remain responsible for all financial decisions.
          </p>
        </section>
        {/* 5. Intellectual Property */}
        <section>
          <h2 className="text-2xl font-semibold text-black mt-8">5. Intellectual Property</h2>
          <p className="mt-2 text-gray-700">
            The application, branding and source code belong to the developers. No part may be reproduced without permission.
          </p>
        </section>
        {/* 6. Account Termination */}
        <section>
          <h2 className="text-2xl font-semibold text-black mt-8">6. Account Termination</h2>
          <p className="mt-2 text-gray-700">
            Users may delete their account permanently from Settings. Deletion removes associated account data.
          </p>
        </section>
        {/* 7. Limitation of Liability */}
        <section>
          <h2 className="text-2xl font-semibold text-black mt-8">7. Limitation of Liability</h2>
          <p className="mt-2 text-gray-700">
            The application is provided "as is" without guarantees. We are not liable for any damages arising from use.
          </p>
        </section>
        {/* 8. Changes to Terms */}
        <section>
          <h2 className="text-2xl font-semibold text-black mt-8">8. Changes to Terms</h2>
          <p className="mt-2 text-gray-700">Terms may be updated in future releases. Continued use constitutes acceptance of the new terms.</p>
        </section>
        {/* 9. Contact */}
        <section>
          <h2 className="text-2xl font-semibold text-black mt-8">9. Contact</h2>
          <p className="mt-2 text-gray-700">
            Email: <a href="mailto:spendwisepro5@gmail.com" className="text-emerald-600 hover:underline">spendwisepro5@gmail.com</a>
          </p>
        </section>
        <footer className="mt-12 text-sm text-gray-500">
          <p>Last Updated: June 2026</p>
        </footer>
        <div className="flex justify-center mt-6">
          <button
            onClick={() => navigate('/')}
            className="px-6 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
};

export default TermsPage;
