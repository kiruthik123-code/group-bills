-- CreateTable
CREATE TABLE "individual_expenses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" DATE NOT NULL DEFAULT CURRENT_DATE,
    "category" TEXT NOT NULL DEFAULT 'Other',
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "individual_expenses_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "individual_expenses" ADD CONSTRAINT "individual_expenses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;