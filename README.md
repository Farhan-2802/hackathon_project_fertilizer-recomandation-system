# TerraGrow – Admin + Farmer Project (CSV Storage)

This is the ready-to-run college web development project. It uses Node.js + Express and CSV files. It does not require MySQL or MySQL Workbench.

## Already included
- `.env` with a newly generated private JWT secret
- All six CSV files in `data/`
- Existing sample crop, fertilizer and fertilizer-rule records from the supplied project
- Original `index.html`, `style.css`, and `script.js` unchanged
- Separate backend admin workspace files

No old local folder or database needs to be copied into this package. The `users.csv` starts empty, so create fresh farmer and admin credentials.

## Start the project
1. Open this exact folder in VS Code (the folder containing `package.json`).
2. Open Terminal > New Terminal.
3. Run these commands one at a time:

   ```powershell
   npm install
   npm run check
   npm start
   ```

4. Open `http://localhost:3000`.

Do not delete `.env` or the `data` folder. Back up `data/` to preserve account and project records. Do not share `.env`.

## Create the Admin account (run once)
Open a second VS Code terminal in the same folder (the server can remain running) and run:

```powershell
npm run create-admin -- admin@terragrow.com "TgAdmin@2026Strong" "TerraGrow Admin"
```

You can replace the email, password and display name with your own values. Password must contain at least 8 characters. Keep the password private.

The command creates the account in `data/users.csv` with the `agronomist` role and a bcrypt password hash. If the email already exists, it changes that account to admin and resets its password to the one supplied.

Then open `http://localhost:3000` and sign in on the existing login page with:
- Email: `admin@terragrow.com`
- Password: `TgAdmin@2026Strong`

These are example credentials from the command above. If you change the command values, use your own values to log in.

## Create a Farmer/User account
On the website choose **Create account**, enter name, email and password (minimum 8 characters). Then sign in using those same credentials. Normal website registrations receive the `user` role.

## Admin workspace
After admin sign-in, the admin management area is available for:
- Add/edit crop profiles and N/P/K thresholds
- Manage fertilizer nutrient composition, default dosage and application timing
- Add/edit fertilizer rules
- Review feedback, set Pending / Reviewed / Actioned status and save an admin note

Admin routes are protected by server-side role checks. Normal users cannot access admin endpoints.

## CSV files
- `data/users.csv`
- `data/crops.csv`
- `data/fertilizers.csv`
- `data/rules.csv`
- `data/recommendations.csv`
- `data/feedback.csv`

`data.sql` is included only as a database-design reference; the running application stores its records in CSV files.

## Notes
CSV storage is suitable for a small local classroom project and a single server process, not production-scale concurrent workloads. Fertilizer rates are editable demo values; actual application rates should be based on crop-specific local guidance and soil testing.
