# Catalogul câmpurilor extrase

Acesta este inventarul câmpurilor pe care extractorul le caută în prima
versiune PF. Sursa executabilă este [`rules.json`](./rules.json).

| Document | Câmp | Ce înseamnă | Verificare ulterioară |
|---|---|---|---|
| identity_document | `last_name` | Numele de familie | compunere nume |
| identity_document | `first_name` | Prenumele | compunere nume |
| identity_document | `cnp` | Identificator fictiv | egal cu fluturașul |
| identity_document | `birth_date` | Data nașterii | format |
| identity_document | `address` | Adresa clientului | egală cu factura |
| identity_document | `doc_number` | Numărul actului fictiv | prezență |
| identity_document | `expiry_date` | Data expirării | comparată cu data de referință |
| utility_bill | `customer_name` | Numele de pe factură | egal cu identitatea |
| utility_bill | `address` | Adresa de pe factură | egală cu identitatea |
| utility_bill | `issue_date` | Data emiterii | verificare vechime |
| utility_bill | `period` | Perioada consumului | informativ |
| utility_bill | `total_amount` | Totalul facturii | format monetar |
| payslip | `employee_name` | Numele angajatului | egal cu identitatea |
| payslip | `cnp` | CNP-ul angajatului | egal cu identitatea |
| payslip | `employer` | Angajatorul fictiv | prezență |
| payslip | `employer_cui` | CUI-ul angajatorului fictiv | format |
| payslip | `issue_date` | Data fluturașului | comparată cu metadatele |
| payslip | `gross_salary` | Salariul brut | calcul net |
| payslip | `cas` | Reținerea CAS | calcul net |
| payslip | `cass` | Reținerea CASS | calcul net |
| payslip | `income_tax` | Impozitul | calcul net |
| payslip | `net_salary` | Salariul net afișat | comparat cu calculul |