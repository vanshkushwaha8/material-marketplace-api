require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const userConsentModel = require('../src/model/userconsent.model');
const statusConstants = require('../src/constants/status.constants');
const deleteConstants = require('../src/constants/delete.constants');
const userTypeConstants = require('../src/constants/usertype.constants');

// Mirrors userConsentService.add()'s overlap rule: an 'all' consent
// overlaps every user type, a scoped one only overlaps itself + 'all'.
const overlappingUserTypesFor = (userType) =>
    userType === 'all'
        ? [userTypeConstants.Investor, userTypeConstants.Developer, 'all']
        : [userType, 'all'];

// Placeholder starter copy — not legal/compliance-reviewed. Review and
// replace via the admin Consent Management page before going live.
const CONSENT_SEED_DATA = [
    {
        type: 'TERMS',
        userType: 'all',
        version: 'v1',
        content: {
            en: 'Placeholder Terms & Conditions. Replace with the reviewed legal copy before launch.',
            fr: 'Conditions générales provisoires. À remplacer par le texte juridique validé avant le lancement.',
        },
        startDate: new Date(),
    },
    {
        type: 'PRIVACY',
        userType: 'all',
        version: 'v1',
        content: {
            en: 'Placeholder Privacy Policy. Replace with the reviewed legal copy before launch.',
            fr: 'Politique de confidentialité provisoire. À remplacer par le texte juridique validé avant le lancement.',
        },
        startDate: new Date(),
    },
    {
        type: 'COOKIE',
        userType: 'all',
        version: 'v1',
        content: {
            en: 'Placeholder Cookie Policy. Replace with the reviewed legal copy before launch.',
            fr: 'Politique de cookies provisoire. À remplacer par le texte juridique validé avant le lancement.',
        },
        startDate: new Date(),
    },
];

const run = async () => {
    await connectDB();

    for (const doc of CONSENT_SEED_DATA) {
        const overlappingUserTypes = overlappingUserTypesFor(doc.userType);

        const existingActive = await userConsentModel.findOne({
            type: doc.type,
            userType: { $in: overlappingUserTypes },
            status: statusConstants.active,
            is_deleted: deleteConstants.NOT_DELETED,
        });

        if (existingActive) {
            console.log(
                `Skipped "${doc.type}" — an active ${existingActive.userType} consent (v${existingActive.version}) already covers this scope.`
            );
            continue;
        }

        const created = await userConsentModel.create({
            ...doc,
            status: statusConstants.active,
            is_deleted: deleteConstants.NOT_DELETED,
        });
        console.log(`Inserted "${doc.type}" consent v${doc.version} (${created._id}).`);
    }

    console.log(
        'Done. Review/adjust via the admin Consent Management page - this is placeholder starter copy, not legal/compliance-reviewed.'
    );
    await mongoose.disconnect();
    process.exit(0);
};

run().catch((error) => {
    console.error('User consent seed failed:', error);
    process.exit(1);
});