import React from 'react';
import { useNavigate } from 'react-router-dom';

const PrivacyPage: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center bg-white min-h-screen py-12 px-4">
      <div className="max-w-[900px] w-full space-y-6">
        <h1 className="text-4xl font-bold text-black">Privacy Policy</h1>
        <p className="text-lg text-gray-700">
          Your privacy matters to us. This policy explains how SpendWise Pro collects, uses, and protects your information.
        </p>
        {/* Sections */}
        <section>
          <h2 className="text-2xl font-semibold text-black mt-8">Information We Collect</h2>
          <ul className="list-disc list-inside mt-2 text-gray-800">
            <li>Name</li>
            <li>Email address</li>
            <li>Google account information (if Google Sign-In is used)</li>
            <li>Profile photo</li>
            <li>Financial data entered by the user</li>
            <li>Budget and expense information</li>
          </ul>
        </section>
        <section>
          <h2 className="text-2xl font-semibold text-black mt-8">How We Use Your Information</h2>
          <ul className="list-disc list-inside mt-2 text-gray-800">
            <li>Authentication</li>
            <li>Financial analytics</li>
            <li>AI-powered insights</li>
            <li>Budget tracking</li>
            <li>Forecasting</li>
            <li>Improving the application</li>
          </ul>
        </section>
        <section>
          <h2 className="text-2xl font-semibold text-black mt-8">Google Sign-In</h2>
          <p className="mt-2 text-gray-800">
            Google authentication is only used to securely identify the user and obtain basic profile information (name, email, and profile picture).
          </p>
        </section>
        <section>
          <h2 className="text-2xl font-semibold text-black mt-8">Data Storage &amp; Security</h2>
          <ul className="list-disc list-inside mt-2 text-gray-800">
            <li>JWT Authentication</li>
            <li>Encrypted passwords (bcrypt)</li>
            <li>Secure backend APIs</li>
            <li>Protected database</li>
          </ul>
        </section>
        <section>
          <h2 className="text-2xl font-semibold text-black mt-8">Third-Party Services</h2>
          <ul className="list-disc list-inside mt-2 text-gray-800">
            <li>Google OAuth</li>
            <li>Brevo (Email Verification &amp; Password Reset)</li>
            <li>Railway</li>
            <li>Vercel</li>
          </ul>
        </section>
        <section>
          <h2 className="text-2xl font-semibold text-black mt-8">Your Rights</h2>
          <ul className="list-disc list-inside mt-2 text-gray-800">
            <li>Update profile</li>
            <li>Delete account</li>
            <li>Request account removal</li>
            <li>Stop using the service anytime</li>
          </ul>
        </section>
        <section>
          <h2 className="text-2xl font-semibold text-black mt-8">Contact</h2>
          <p className="mt-2 text-gray-800">
            Email: <a href="mailto:spendwisepro5@gmail.com" className="text-emerald-600 hover:underline">spendwisepro5@gmail.com</a>
          </p>
        </section>
        <footer className="mt-12 text-sm text-gray-500">
          <p>Last Updated: August 2026</p>
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

export default PrivacyPage;
