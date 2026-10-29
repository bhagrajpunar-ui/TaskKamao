PUT google-services.json HERE  ->  app/android/app/google-services.json

1. Firebase Console > your project > Project settings (gear icon) > General
2. "Your apps" > Add app > Android
3. Android package name:  com.taskkamao.app   (must match applicationId in app/build.gradle)
4. Add your SHA-1 and SHA-256 (needed for Phone OTP):
      cd app/android  &&  ./gradlew signingReport      (Windows: gradlew signingReport)
   Add BOTH the debug key and your release/upload key, and later the
   "App signing key" SHA-1/SHA-256 from Play Console > Setup > App integrity.
5. Download google-services.json and copy it into THIS folder.

Do NOT commit this file to a public GitHub repo. This project never contains real keys.
