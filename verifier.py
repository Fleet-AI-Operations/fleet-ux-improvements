def verify_multi_app_8e8dad56_a769_4966_b9b7_5055983e3904(env, final_answer=None, *args, **kwargs):
    """Combined verifier that calls individual app verifiers and returns 1 if all pass"""

    def verify_cadence(
        env: Environment, final_answer: str | None = None, *args, **kwargs
    ) -> int:
        """Validate that the task was completed correctly"""
        error_accumulator = []
        success_accumulator = []

        env.app("cadence").load()
        seed = env.app("cadence").db("seed")
        current = env.app("cadence").db("current")

        # Helper function to find new entries in tables with non-deterministic IDs
        def find_new_entries(table_name, id_field="id", filter_conditions=None):
            before_query = seed.table(table_name)
            if filter_conditions:
                for key, value in filter_conditions.items():
                    before_query = before_query.eq(key, value)
            before_entries = before_query.select(id_field).all()

            after_query = current.table(table_name)
            if filter_conditions:
                for key, value in filter_conditions.items():
                    after_query = after_query.eq(key, value)
            after_entries = after_query.all()

            before_ids = {entry[id_field] for entry in before_entries}
            new_entries = [entry for entry in after_entries if entry[id_field] not in before_ids]
            return new_entries

        #### VALIDATE THE SOLUTION CRITERIA ####

        # 1. Verify "Operations" department was created
        try:
            ops_dept = current.table("departments").eq("name", "Operations").first()
            if ops_dept:
                success_accumulator.append("[C] 'Operations' department was created")
                ops_dept_id = ops_dept["id"]
            else:
                error_accumulator.append("[X] 'Operations' department not found")
                ops_dept_id = None
        except Exception as e:
            error_accumulator.append(f"[X] Error looking up Operations department: {e}")
            ops_dept_id = None

        # 2. Verify Joseph Russell (employee_id=29) has department_id set to Operations
        try:
            joseph = current.table("employees").eq("id", 29).first()
            if joseph:
                if ops_dept_id is not None and joseph.get("department_id") == ops_dept_id:
                    success_accumulator.append(f"[C] Joseph Russell's department_id is set to Operations (id={ops_dept_id})")
                else:
                    error_accumulator.append(f"[X] Joseph Russell's department_id should be {ops_dept_id}, got {joseph.get('department_id')}")
            else:
                error_accumulator.append("[X] Employee with id=29 (Joseph Russell) not found")
        except Exception as e:
            error_accumulator.append(f"[X] Error checking Joseph Russell's department: {e}")

        # 3. Verify work email was added via employee_apps for Joseph Russell
        try:
            work_email_app = current.table("employee_apps").eq("employee_id", 29).eq("app_type", "email").first()
            if work_email_app:
                account_id = work_email_app.get("account_identifier", "")
                if normalized_contains("joseph.russell@veridianenergy.com", account_id):
                    success_accumulator.append("[C] Joseph Russell's work email set to joseph.russell@veridianenergy.com")
                else:
                    error_accumulator.append(f"[X] Work email should be joseph.russell@veridianenergy.com, got {account_id}")

                conn_status = work_email_app.get("connection_status", "")
                if conn_status == "connected":
                    success_accumulator.append("[C] Work email app connection status is 'connected'")
                else:
                    error_accumulator.append(f"[X] Work email app connection status should be 'connected', got '{conn_status}'")
            else:
                error_accumulator.append("[X] No email app entry found for Joseph Russell (employee_id=29)")
        except Exception as e:
            error_accumulator.append(f"[X] Error checking work email app: {e}")

        # 4. Verify onboarding task for adding Joseph's work email is completed with correct email
        try:
            email_task = current.table("onboarding_tasks").eq("employee_id", 29).eq("task_type", "add_work_email").first()
            if email_task:
                if email_task.get("status") == "completed":
                    success_accumulator.append("[C] 'Add work email' onboarding task for Joseph is completed")
                else:
                    error_accumulator.append(f"[X] 'Add work email' task status should be 'completed', got '{email_task.get('status')}'")

                completed_value = email_task.get("completed_value", "")
                if normalized_contains("joseph.russell@veridianenergy.com", str(completed_value)):
                    success_accumulator.append("[C] Work email task completed_value is joseph.russell@veridianenergy.com")
                else:
                    error_accumulator.append(f"[X] Work email task completed_value should be joseph.russell@veridianenergy.com, got '{completed_value}'")
            else:
                error_accumulator.append("[X] 'Add work email' onboarding task not found for Joseph Russell")
        except Exception as e:
            error_accumulator.append(f"[X] Error checking work email onboarding task: {e}")

        # 5. Verify the invite_to_cadence task exists for Joseph (reminder invite)
        try:
            invite_task = current.table("onboarding_tasks").eq("employee_id", 29).eq("task_type", "invite_to_cadence").first()
            if invite_task:
                success_accumulator.append("[C] 'Invite to Cadence' onboarding task exists for Joseph Russell")
            else:
                error_accumulator.append("[X] 'Invite to Cadence' onboarding task not found for Joseph Russell")
        except Exception as e:
            error_accumulator.append(f"[X] Error checking invite task: {e}")

        # 6. Use expect_only_v2 to verify no unexpected changes occurred
        # Find new department ID
        new_depts = find_new_entries("departments")
        new_dept_ids = [d["id"] for d in new_depts]

        # Find new employee_apps entries
        new_apps = find_new_entries("employee_apps")
        new_app_ids = [a["id"] for a in new_apps]

        # Find new onboarding_tasks entries
        new_tasks = find_new_entries("onboarding_tasks")
        new_task_ids = [t["id"] for t in new_tasks]

        # Build expected changes for departments
        expected_changes = []

        # Department insert - find the Operations dept
        for dept in new_depts:
            if dept.get("name") == "Operations":
                expected_changes.append({
                    "table": "departments",
                    "pk": dept["id"],
                    "type": "insert",
                    "fields": [
                        ("id", ...),
                        ("uuid", ...),
                        ("name", "Operations"),
                        ("description", None),
                    ]
                })

        # Employee_apps insert for Joseph
        for app in new_apps:
            if app.get("employee_id") == 29 and app.get("app_type") == "email":
                expected_changes.append({
                    "table": "employee_apps",
                    "pk": app["id"],
                    "type": "insert",
                    "fields": [
                        ("id", ...),
                        ("uuid", ...),
                        ("employee_id", 29),
                        ("app_name", ...),
                        ("app_type", "email"),
                        ("connection_status", "connected"),
                        ("account_identifier", "joseph.russell@veridianenergy.com"),
                        ("connected_at", ...),
                        ("disconnected_at", None),
                    ]
                })

        # Employee modification - Joseph Russell department set
        expected_changes.append({
            "table": "employees",
            "pk": 29,
            "type": "modify",
            "resulting_fields": [
                ("department_id", ops_dept_id),
            ],
            "no_other_changes": True
        })

        # Onboarding tasks - account for ALL new tasks (Joseph's + any side-effect tasks for other onboarding employees)
        for task in new_tasks:
            emp_id = task.get("employee_id")
            task_type = task.get("task_type", "")
            fields = [
                ("id", ...),
                ("employee_id", emp_id),
                ("task_type", task_type),
                ("title", ...),
                ("status", ...),
                ("due_date", ...),
                ("completed_at", ...),
                ("completed_value", ...),
            ]
            expected_changes.append({
                "table": "onboarding_tasks",
                "pk": task["id"],
                "type": "insert",
                "fields": fields
            })

        ignore_config = IgnoreConfig(
            tables={'__drizzle_migrations', 'sqlite_sequence', 'login_activities', 'activity_log', 'search_history', '_db_metadata', '_generation_state', 'form_drafts', 'onboarding_invitations'},
            fields={"created_at", "updated_at"},
            table_fields={
                'addresses': {'updated_at', 'created_at'},
                'bank_accounts': {'updated_at', 'created_at'},
                'benefit_deductions': {'created_at'},
                'benefits': {'updated_at', 'created_at'},
                'benefits_terminations': {'updated_at', 'created_at'},
                'company_bank_accounts': {'created_at'},
                'compliance_tasks': {'updated_at', 'created_at'},
                'contractor_addresses': {'created_at'},
                'contractor_bank_accounts': {'created_at'},
                'contractor_payments': {'processed_at', 'updated_at', 'cancelled_at', 'created_at'},
                'contractors': {'updated_at', 'created_at'},
                'dependents': {'updated_at', 'created_at'},
                'direct_deposit_authorizations': {'authorized_at', 'updated_at', 'created_at'},
                'employee_addresses': {'created_at'},
                'employee_bank_accounts': {'created_at'},
                'employee_benefits': {'updated_at', 'created_at'},
                'employee_compensations': {'updated_at', 'created_at'},
                'employees': {'updated_at', 'created_at'},
                'federal_tax_info': {'updated_at', 'created_at'},
                'fixed_compensations': {'updated_at', 'created_at'},
                'form_1099s': {'generated_at', 'filed_at', 'updated_at', 'created_at'},
                'forms': {'sent_at', 'updated_at', 'signed_at', 'created_at'},
                'garnishments': {'updated_at', 'created_at'},
                'hourly_compensations': {'updated_at', 'created_at'},
                'i9_authorizations': {'employee_signed_at', 'updated_at', 'employer_signed_at', 'created_at'},
                'i9_documents': {'created_at'},
                'jobs': {'updated_at', 'created_at'},
                'journal_entries': {'reversed_at', 'updated_at', 'posted_at', 'created_at'},
                'journal_entry_lines': {'created_at'},
                'life_events': {'updated_at', 'created_at'},
                'locations': {'updated_at', 'created_at'},
                'open_enrollment_periods': {'updated_at', 'created_at'},
                'paid_time_off': {'updated_at', 'created_at'},
                'pay_schedule_employees': {'created_at'},
                'pay_schedules': {'updated_at', 'created_at'},
                'payroll_approvals': {'updated_at', 'approved_at', 'created_at'},
                'payroll_totals': {'updated_at', 'created_at'},
                'payrolls': {'updated_at', 'created_at', 'cancelled_at', 'calculated_at', 'submitted_at', 'processed_at'},
                'reimbursements': {'updated_at', 'created_at'},
                'state_tax_info': {'updated_at', 'created_at'},
                'tax_liabilities': {'updated_at', 'created_at'},
                'tax_withholdings': {'created_at'},
                'time_off_policies': {'updated_at', 'created_at'},
                'time_off_policy_employees': {'updated_at', 'created_at'},
                'timesheets': {'updated_at', 'approved_at', 'created_at'},
                'departments': {'updated_at', 'created_at'},
                'employee_apps': {'updated_at', 'created_at', 'connected_at'},
                'onboarding_tasks': {'updated_at', 'created_at', 'completed_at'},
            }
        )

        try:
            seed.diff(current, ignore_config).expect_only_v2(expected_changes)
            success_accumulator.append("[C] Expected changes were found in the database diff with no unexpected side effects")
        except AssertionError as e:
            error_accumulator.append(f"[X] Database diff validation failed: {e}")

        if len(error_accumulator) > 0:
            print(f">>> ERROR_ACCUMULATOR >>>\n{error_accumulator}\n<<< ERROR_ACCUMULATOR <<<")
            print(f">>> SUCCESS_ACCUMULATOR >>>\n{success_accumulator}\n<<< SUCCESS_ACCUMULATOR <<<")
            return TASK_FAILED_SCORE

        print(f">>> SUCCESS_ACCUMULATOR >>>\n{success_accumulator}\n<<< SUCCESS_ACCUMULATOR <<<")
        return TASK_SUCCESSFUL_SCORE


    def verify_outlook(env: Environment, final_answer: str | None = None, *args, **kwargs) -> int:
        """Validate that the email to Joseph Russell about his onboarding NDA template was sent correctly."""
        error_accumulator = []
        success_accumulator = []

        env.app("outlook").load()
        seed = env.app("outlook").db("seed")
        current = env.app("outlook").db("current")

        # Helper function to find new entries in tables with non-deterministic IDs
        def find_new_entries(table_name, id_field="id", filter_conditions=None):
            before_query = seed.table(table_name)
            after_query = current.table(table_name)
            if filter_conditions:
                for key, value in filter_conditions.items():
                    before_query = before_query.eq(key, value)
                    after_query = after_query.eq(key, value)
            before_ids = {entry[id_field] for entry in before_query.select(id_field).all()}
            after_entries = after_query.all()
            return [entry for entry in after_entries if entry[id_field] not in before_ids]

        # ========== FIND THE NEW EMAIL ==========
        new_messages = find_new_entries("messages")

        target_email = None
        for msg in new_messages:
            if normalized_contains("Onboarding NDA-One-Way Template sent", msg.get("subject", "")):
                target_email = msg
                break

        # Fallback: match by recipient
        if not target_email:
            for msg in new_messages:
                to = json.loads(msg.get("toRecipients", "[]"))
                if any("joseph.russell@veridianenergy.com" in r.get("emailAddress", {}).get("address", "").lower() for r in to):
                    target_email = msg
                    break

        if not target_email:
            error_accumulator.append("[X] No email found with subject 'Onboarding NDA-One-Way Template sent' or to joseph.russell@veridianenergy.com")
            print(f">>> ERROR_ACCUMULATOR >>>\n{error_accumulator}\n<<< ERROR_ACCUMULATOR <<<")
            return TASK_FAILED_SCORE

        success_accumulator.append("[C] Found new email related to onboarding NDA template")

        # ========== VERIFY EMAIL IS SENT (NOT DRAFT) ==========
        if target_email.get("isDraft") == 0:
            success_accumulator.append("[C] Email is sent (not a draft)")
        else:
            error_accumulator.append("[X] Email is still a draft")

        # ========== VERIFY SUBJECT ==========
        expected_subject = "Onboarding NDA-One-Way Template sent"
        if normalized_contains(expected_subject, target_email.get("subject", "")):
            success_accumulator.append(f"[C] Email subject contains '{expected_subject}'")
        else:
            error_accumulator.append(f"[X] Email subject does not contain '{expected_subject}', got: '{target_email.get('subject')}'")

        # ========== VERIFY RECIPIENT ==========
        to_recipients = json.loads(target_email.get("toRecipients", "[]"))
        joseph_found = any(
            "joseph.russell@veridianenergy.com" in r.get("emailAddress", {}).get("address", "").lower()
            for r in to_recipients
        )
        if joseph_found:
            success_accumulator.append("[C] Email sent to joseph.russell@veridianenergy.com")
        else:
            error_accumulator.append(f"[X] Email not sent to joseph.russell@veridianenergy.com, recipients: {to_recipients}")

        # ========== VERIFY BODY STARTS WITH "Good afternoon, Joseph." ==========
        body_content = target_email.get("body_content", "")
        if normalized_contains("Good afternoon Joseph", body_content):
            success_accumulator.append("[C] Email body starts with 'Good afternoon, Joseph'")
        else:
            error_accumulator.append(f"[X] Email body does not contain 'Good afternoon, Joseph'")

        # ========== VERIFY BODY MENTIONS NDA/TEMPLATE ==========
        # Check that the email mentions the onboarding template being sent
        if normalized_contains("NDA", body_content) or normalized_contains("template", body_content):
            success_accumulator.append("[C] Email body mentions NDA/template")
        else:
            error_accumulator.append("[X] Email body does not mention NDA or template")

        # ========== VERIFY JOB TITLE IS MENTIONED ==========
        # The task requires explicitly including Joseph's specific job title from his Cadence profile.
        # From the Cadence environment, Joseph Russell's job title is 
        # "Senior Effortless Elegance Interrogators Specialist".
        # We verify the email body contains this distinctive job title.
        # We look up from the Cadence environment to get the actual title.
        try:
            env.app("cadence").load()
            cadence_current = env.app("cadence").db("current")
            joseph_employee = cadence_current.table("employees").eq("id", 29).first()
            if joseph_employee:
                job_title = joseph_employee.get("job_title", "")
                if job_title and normalized_contains(job_title, body_content):
                    success_accumulator.append(f"[C] Email body contains Joseph's job title: '{job_title}'")
                elif job_title:
                    error_accumulator.append(f"[X] Email body does not contain Joseph's job title '{job_title}'")
                else:
                    # Fallback: check for the known title from the cross-env diff
                    if normalized_contains("Effortless Elegance Interrogators", body_content):
                        success_accumulator.append("[C] Email body contains Joseph's distinctive job title")
                    else:
                        error_accumulator.append("[X] Email body does not contain Joseph's job title")
            else:
                # Can't find employee, fall back to checking the known title
                if normalized_contains("Effortless Elegance Interrogators", body_content):
                    success_accumulator.append("[C] Email body contains Joseph's distinctive job title")
                else:
                    error_accumulator.append("[X] Email body does not contain Joseph's job title")
        except Exception:
            # If Cadence env not available, check for the known distinctive title phrase
            if normalized_contains("Effortless Elegance Interrogators", body_content):
                success_accumulator.append("[C] Email body contains Joseph's distinctive job title")
            else:
                error_accumulator.append("[X] Email body does not contain Joseph's job title")

        # ========== BUILD EXPECTED CHANGES ==========
        target_id = target_email["id"]

        # Find new email_folders entries
        new_email_folders = find_new_entries("email_folders", id_field="emailId")
        # Deduplicate - email_folders has composite PK (userId, emailId, folderId)
        # We need to find entries for this email
        email_folder_entries = current.table("email_folders").eq("emailId", target_id).all()
        seed_email_folder_entries = seed.table("email_folders").eq("emailId", target_id).all()
        seed_ef_keys = {(e["userId"], e["emailId"], e["folderId"]) for e in seed_email_folder_entries}
        new_ef_entries = [e for e in email_folder_entries if (e["userId"], e["emailId"], e["folderId"]) not in seed_ef_keys]

        expected_changes = [
            {
                "table": "messages",
                "pk": target_id,
                "type": "insert",
                "fields": [
                    ("id", target_id),
                    ("odata_etag", ...),
                    ("changeKey", ...),
                    ("createdDateTime", ...),
                    ("lastModifiedDateTime", ...),
                    ("receivedDateTime", ...),
                    ("sentDateTime", ...),
                    ("hasAttachments", ...),
                    ("isDeliveryReceiptRequested", ...),
                    ("isReadReceiptRequested", ...),
                    ("isRead", ...),
                    ("isDraft", 0),
                    ("categories", ...),
                    ("importance", ...),
                    ("internetMessageId", ...),
                    ("subject", ...),
                    ("bodyPreview", ...),
                    ("parentFolderId", ...),
                    ("conversationId", ...),
                    ("conversationIndex", ...),
                    ("inferenceClassification", ...),
                    ("webLink", ...),
                    ("flagStatus", ...),
                    ("body_contentType", ...),
                    ("body_content", ...),
                    ("sender_name", ...),
                    ("sender_address", ...),
                    ("from_name", ...),
                    ("from_address", ...),
                    ("toRecipients", ...),
                    ("ccRecipients", ...),
                    ("bccRecipients", ...),
                    ("replyTo", ...),
                ]
            },
        ]

        # Add email_folders entries
        for ef in new_ef_entries:
            expected_changes.append({
                "table": "email_folders",
                "pk": (ef["userId"], ef["emailId"], ef["folderId"]),
                "type": "insert",
                "fields": [
                    ("userId", ef["userId"]),
                    ("emailId", ef["emailId"]),
                    ("folderId", ef["folderId"]),
                    ("isRead", ...),
                    ("snoozeTimestamp", ...),
                ]
            })

        ignore_config = IgnoreConfig(
            tables={
                "activities", "section_chats", "sections", "section_channels",
                "search_history", "attachments", "teams_presence",
                "todo_task_lists", "todo_tasks", "todo_task_steps",
            },
            fields={"isRead"},
            table_fields={
                "messages": {"receivedDateTime", "lastModifiedDateTime", "sentDateTime", "createdDateTime", "changeKey", "odata_etag"},
                "chats": {"lastUpdatedDateTime", "createdDateTime"},
                "channel_messages": {"deletedDateTime", "lastModifiedDateTime", "createdDateTime"},
                "folders": {"unreadItemCount", "totalItemCount"},
                "users": {"lastModifiedDateTime", "createdDateTime"},
                "calendar_events": {"lastModifiedDateTime", "createdDateTime"},
                "calendar_attendees": {"responseDateTime"},
            }
        )

        try:
            seed.diff(current, ignore_config).expect_only_v2(expected_changes)
            success_accumulator.append("[C] Database diff validated - no unexpected changes")
        except AssertionError as e:
            error_accumulator.append(f"[X] Unexpected database changes: {e}")

        if len(error_accumulator) > 0:
            print(f">>> ERROR_ACCUMULATOR >>>\n{error_accumulator}\n<<< ERROR_ACCUMULATOR <<<")
            print(f">>> SUCCESS_ACCUMULATOR >>>\n{success_accumulator}\n<<< SUCCESS_ACCUMULATOR <<<")
            return TASK_FAILED_SCORE

        print(f">>> SUCCESS_ACCUMULATOR >>>\n{success_accumulator}\n<<< SUCCESS_ACCUMULATOR <<<")
        return TASK_SUCCESSFUL_SCORE


    def verify_docusign(
        env: Environment, final_answer: str | None = None, *args, **kwargs
    ) -> int:
        """Validate that the task was completed correctly in the docusign environment"""
        error_accumulator = []
        success_accumulator = []

        env.app("docusign").load()
        seed = env.app("docusign").db("seed")
        current = env.app("docusign").db("current")

        # Helper function to find new entries in tables with non-deterministic IDs
        def find_new_entries(table_name, id_field="id", filter_conditions=None):
            before_query = seed.table(table_name)
            if filter_conditions:
                for key, value in filter_conditions.items():
                    before_query = before_query.eq(key, value)
            before_entries = before_query.select(id_field).all()

            after_query = current.table(table_name)
            if filter_conditions:
                for key, value in filter_conditions.items():
                    after_query = after_query.eq(key, value)
            after_entries = after_query.all()

            before_ids = {entry[id_field] for entry in before_entries}
            new_entries = [entry for entry in after_entries if entry[id_field] not in before_ids]
            return new_entries

        # ============================================================
        # 1. Verify a new envelope was created
        # ============================================================
        new_envelopes = find_new_entries("envelopes")

        if len(new_envelopes) != 1:
            error_accumulator.append(f"[X] Expected 1 new envelope, found {len(new_envelopes)}")
            print(f">>> ERROR_ACCUMULATOR >>>\n{error_accumulator}\n<<< ERROR_ACCUMULATOR <<<")
            return TASK_FAILED_SCORE

        new_envelope = new_envelopes[0]
        envelope_id = new_envelope["id"]
        success_accumulator.append(f"[C] Found 1 new envelope with id: {envelope_id}")

        # Verify envelope subject references NDA-One-Way Template
        if not normalized_contains("NDA-One-Way", new_envelope.get("subject", "")):
            error_accumulator.append(f"[X] Envelope subject should reference 'NDA-One-Way', got: {new_envelope.get('subject')}")
        else:
            success_accumulator.append(f"[C] Envelope subject references 'NDA-One-Way'")

        # Verify envelope status is 'sent' (document was routed for signatures)
        if new_envelope.get("status") != "sent":
            error_accumulator.append(f"[X] Envelope status should be 'sent', got: {new_envelope.get('status')}")
        else:
            success_accumulator.append("[C] Envelope status is 'sent'")

        # Verify signing_order_enabled is 1 (sequential signing)
        if new_envelope.get("signing_order_enabled") != 1:
            error_accumulator.append(f"[X] signing_order_enabled should be 1, got: {new_envelope.get('signing_order_enabled')}")
        else:
            success_accumulator.append("[C] signing_order_enabled is 1")

        # Verify reminder_frequency is 'every-day'
        if new_envelope.get("reminder_frequency") != "every-day":
            error_accumulator.append(f"[X] reminder_frequency should be 'every-day', got: {new_envelope.get('reminder_frequency')}")
        else:
            success_accumulator.append("[C] reminder_frequency is 'every-day'")

        # ============================================================
        # 2. Verify recipients
        # ============================================================
        new_recipients = current.table("envelope_recipients").eq("envelope_id", envelope_id).all()

        if len(new_recipients) != 2:
            error_accumulator.append(f"[X] Expected 2 recipients, found {len(new_recipients)}")
        else:
            success_accumulator.append("[C] Found 2 recipients")

            # Build lookup by email for order-independent validation
            recipients_by_email = {r["email"]: r for r in new_recipients}

            # Verify Joseph Russell recipient
            joseph_email = "joseph.russell@veridianenergy.com"
            if joseph_email not in recipients_by_email:
                error_accumulator.append(f"[X] No recipient found with email {joseph_email}")
            else:
                joseph_r = recipients_by_email[joseph_email]
                if not normalized_contains("Joseph Russell", joseph_r.get("name", "")):
                    error_accumulator.append(f"[X] Joseph's recipient name should be 'Joseph Russell', got: {joseph_r.get('name')}")
                else:
                    success_accumulator.append("[C] Joseph Russell recipient name is correct")

                if joseph_r.get("action") != "needs-to-sign":
                    error_accumulator.append(f"[X] Joseph's action should be 'needs-to-sign', got: {joseph_r.get('action')}")
                else:
                    success_accumulator.append("[C] Joseph's action is 'needs-to-sign'")

                if joseph_r.get("signing_order") != 1:
                    error_accumulator.append(f"[X] Joseph's signing_order should be 1, got: {joseph_r.get('signing_order')}")
                else:
                    success_accumulator.append("[C] Joseph's signing_order is 1")

            # Verify Nancy White recipient
            nancy_email = "nancy.white@veridianenergy.com"
            if nancy_email not in recipients_by_email:
                error_accumulator.append(f"[X] No recipient found with email {nancy_email}")
            else:
                nancy_r = recipients_by_email[nancy_email]
                if not normalized_contains("Nancy White", nancy_r.get("name", "")):
                    error_accumulator.append(f"[X] Nancy's recipient name should be 'Nancy White', got: {nancy_r.get('name')}")
                else:
                    success_accumulator.append("[C] Nancy White recipient name is correct")

                if nancy_r.get("action") != "needs-to-sign":
                    error_accumulator.append(f"[X] Nancy's action should be 'needs-to-sign', got: {nancy_r.get('action')}")
                else:
                    success_accumulator.append("[C] Nancy's action is 'needs-to-sign'")

        # ============================================================
        # 3. Verify envelope document was created
        # ============================================================
        new_docs = find_new_entries("envelope_documents")
        env_docs = [d for d in new_docs if d["envelope_id"] == envelope_id]

        if len(env_docs) < 1:
            error_accumulator.append("[X] No envelope document found for the new envelope")
        else:
            success_accumulator.append(f"[C] Found {len(env_docs)} envelope document(s)")
            # Check the document references NDA-One-Way
            doc = env_docs[0]
            if not normalized_contains("NDA", doc.get("file_name", "")):
                error_accumulator.append(f"[X] Document file_name should reference NDA, got: {doc.get('file_name')}")
            else:
                success_accumulator.append(f"[C] Document file_name references NDA: {doc.get('file_name')}")

        # ============================================================
        # 4. Verify document fields were created for the envelope
        # ============================================================
        new_fields = find_new_entries("document_fields")
        # Filter to only fields for this envelope's documents
        doc_ids = {d["id"] for d in env_docs}
        envelope_fields = [f for f in new_fields if f["document_id"] in doc_ids]

        if len(envelope_fields) < 4:
            error_accumulator.append(f"[X] Expected at least 4 document fields (signature, date-signed, name, email), found {len(envelope_fields)}")
        else:
            success_accumulator.append(f"[C] Found {len(envelope_fields)} document fields for the envelope")

        # Verify field types include signatures
        field_types = {f["field_type"] for f in envelope_fields}
        if "signature" not in field_types:
            error_accumulator.append("[X] No signature field found among document fields")
        else:
            success_accumulator.append("[C] Signature field(s) found")

        # ============================================================
        # 5. Use expect_only_v2 for strict diff validation
        # ============================================================
        ignore_config = IgnoreConfig(
            tables={"sqlite_sequence"},
            table_fields={
                "audit_trail": {"ip_address", "created_at"},
                "document_fields": {"created_at"},
                "envelope_documents": {"created_at"},
                "envelope_recipients": {"viewed_at", "updated_at", "signed_at", "created_at"},
                "envelopes": {"sent_at", "updated_at", "expires_at", "created_at", "completed_at"},
            }
        )

        # Build expected_changes
        # Get the actual recipient IDs by email
        joseph_recipient = None
        nancy_recipient = None
        for r in new_recipients:
            if r["email"] == "joseph.russell@veridianenergy.com":
                joseph_recipient = r
            elif r["email"] == "nancy.white@veridianenergy.com":
                nancy_recipient = r

        # Get audit trail entries for the envelope
        new_audit = find_new_entries("audit_trail")
        envelope_audit = [a for a in new_audit if a.get("envelope_id") == envelope_id]

        expected_changes = [
            # New envelope
            {
                "table": "envelopes",
                "pk": envelope_id,
                "type": "insert",
                "fields": [
                    ("id", envelope_id),
                    ("user_id", new_envelope["user_id"]),
                    ("template_id", new_envelope.get("template_id")),
                    ("subject", ...),  # Non-deterministic subject from template
                    ("message", ...),
                    ("status", "sent"),
                    ("envelope_type", new_envelope.get("envelope_type")),
                    ("signing_order_enabled", 1),
                    ("reminder_frequency", "every-day"),
                    ("void_reason", None),
                ]
            },
        ]

        # Add envelope document
        if env_docs:
            doc = env_docs[0]
            expected_changes.append({
                "table": "envelope_documents",
                "pk": doc["id"],
                "type": "insert",
                "fields": [
                    ("id", doc["id"]),
                    ("envelope_id", envelope_id),
                    ("file_name", ...),
                    ("file_type", ...),
                    ("file_size", ...),
                    ("page_count", ...),
                    ("original_file_data", ...),
                    ("signed_file_data", None),
                    ("annotations", None),
                    ("storage_type", "inline"),
                ]
            })

        # Add recipients
        if joseph_recipient:
            expected_changes.append({
                "table": "envelope_recipients",
                "pk": joseph_recipient["id"],
                "type": "insert",
                "fields": [
                    ("id", joseph_recipient["id"]),
                    ("envelope_id", envelope_id),
                    ("role", ...),
                    ("name", "Joseph Russell"),
                    ("email", "joseph.russell@veridianenergy.com"),
                    ("action", "needs-to-sign"),
                    ("signing_order", 1),
                    ("status", ...),
                    ("access_token", ...),
                ]
            })

        if nancy_recipient:
            expected_changes.append({
                "table": "envelope_recipients",
                "pk": nancy_recipient["id"],
                "type": "insert",
                "fields": [
                    ("id", nancy_recipient["id"]),
                    ("envelope_id", envelope_id),
                    ("role", ...),
                    ("name", "Nancy White"),
                    ("email", "nancy.white@veridianenergy.com"),
                    ("action", "needs-to-sign"),
                    ("signing_order", ...),
                    ("status", ...),
                    ("access_token", ...),
                ]
            })

        # Add document fields
        for field in envelope_fields:
            expected_changes.append({
                "table": "document_fields",
                "pk": field["id"],
                "type": "insert",
                "fields": [
                    ("id", field["id"]),
                    ("document_id", ...),
                    ("document_type", "envelope"),
                    ("recipient_id", ...),
                    ("field_type", ...),
                    ("page_number", ...),
                    ("x_position", ...),
                    ("y_position", ...),
                    ("width", ...),
                    ("height", ...),
                    ("is_required", ...),
                    ("placeholder_text", ...),
                    ("data_label", ...),
                    ("group_id", ...),
                    ("group_label", ...),
                    ("group_tooltip", ...),
                    ("field_options", ...),
                    ("default_value", ...),
                    ("selected_value", ...),
                    ("tooltip", ...),
                    ("button_text", ...),
                    ("background_image", ...),
                    ("conditional_trigger_field_id", ...),
                    ("conditional_operator", ...),
                    ("conditional_value", ...),
                    ("conditional_action", ...),
                    ("formula_expression", ...),
                    ("formula_precision", ...),
                ]
            })

        # Add audit trail entries
        for audit in envelope_audit:
            expected_changes.append({
                "table": "audit_trail",
                "pk": audit["id"],
                "type": "insert",
                "fields": [
                    ("id", audit["id"]),
                    ("envelope_id", envelope_id),
                    ("user_id", ...),
                    ("action", ...),
                    ("details", ...),
                ]
            })

        try:
            seed.diff(current, ignore_config).expect_only_v2(expected_changes)
            success_accumulator.append("[C] Expected changes match the database diff (no unexpected changes)")
        except AssertionError as e:
            error_accumulator.append(f"[X] Database diff validation failed: {e}")

        if len(error_accumulator) > 0:
            print(f">>> ERROR_ACCUMULATOR >>>\n{error_accumulator}\n<<< ERROR_ACCUMULATOR <<<")
            print(f">>> SUCCESS_ACCUMULATOR >>>\n{success_accumulator}\n<<< SUCCESS_ACCUMULATOR <<<")
            return TASK_FAILED_SCORE

        print(f">>> SUCCESS_ACCUMULATOR >>>\n{success_accumulator}\n<<< SUCCESS_ACCUMULATOR <<<")
        return TASK_SUCCESSFUL_SCORE


    def verify_files(
        env: Environment, final_answer: str | None = None, *args, **kwargs
    ) -> int:
        """Verify filesystem changes for this task.

        This task involves onboarding actions in Cadence, creating an envelope in Seal,
        and sending an email in Latch — all database-level operations. No file creation
        or modification on the filesystem was requested. The only filesystem changes
        detected are system-level Python library directories, which are infrastructure
        noise and not task-relevant.
        """
        error_accumulator = []
        success_accumulator = []

        # No file creation was requested by the task, so just return success.
        # Database-level changes are verified by separate per-app verifiers.
        success_accumulator.append("[C] No filesystem changes expected for this task — all actions are database-level")

        if error_accumulator:
            for e in error_accumulator:
                print(f"FAIL: {e}")
            return TASK_FAILED_SCORE

        for s in success_accumulator:
            print(f"PASS: {s}")
        return TASK_SUCCESSFUL_SCORE


    results = {}
    total_score = 0
    total_apps = 4

    # Verify app: cadence
    try:
        print(f'<<< VERIFY_cadence <<<')
        result = verify_cadence(env, final_answer)
        print(f'>>> VERIFY_cadence >>>')
        results['cadence'] = result
        total_score += result
        print(f'App cadence: {result}')
    except Exception as e:
        print(f'Error in app cadence: {e}')
        results['cadence'] = 0

    # Verify app: outlook
    try:
        print(f'<<< VERIFY_outlook <<<')
        result = verify_outlook(env, final_answer)
        print(f'>>> VERIFY_outlook >>>')
        results['outlook'] = result
        total_score += result
        print(f'App outlook: {result}')
    except Exception as e:
        print(f'Error in app outlook: {e}')
        results['outlook'] = 0

    # Verify app: docusign
    try:
        print(f'<<< VERIFY_docusign <<<')
        result = verify_docusign(env, final_answer)
        print(f'>>> VERIFY_docusign >>>')
        results['docusign'] = result
        total_score += result
        print(f'App docusign: {result}')
    except Exception as e:
        print(f'Error in app docusign: {e}')
        results['docusign'] = 0

    # Verify app: files
    try:
        print(f'<<< VERIFY_files <<<')
        result = verify_files(env, final_answer)
        print(f'>>> VERIFY_files >>>')
        results['files'] = result
        total_score += result
        print(f'App files: {result}')
    except Exception as e:
        print(f'Error in app files: {e}')
        results['files'] = 0

    # All apps must pass (return 1) for the combined verifier to pass
    success = total_score == total_apps
    print(f'Combined result: {total_score}/{total_apps} apps passed')
    return 1 if success else 0