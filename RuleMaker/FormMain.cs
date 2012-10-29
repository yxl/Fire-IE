using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Linq;
using System.Text;
using System.Windows.Forms;

namespace RuleMaker
{
	public partial class FormMain : Form
	{
		public FormMain()
		{
			InitializeComponent();
		}

		private void btnChecksum_Click(object sender, EventArgs e)
		{
			OpenFileDialog dlg = new OpenFileDialog();
			dlg.Filter = "txt files (*.txt)|*.txt|All files (*.*)|*.*";
			dlg.FilterIndex = 2;
			dlg.RestoreDirectory = true;
			if (dlg.ShowDialog() == DialogResult.OK)
			{
				ChinaList list = new ChinaList(dlg.FileName);
				list.Update();
				try
				{
					list.Validate();
					MessageBox.Show("Succeeded!");
				}
				catch (Exception ex)
				{
					MessageBox.Show(ex.ToString(), "error");
				}
			}
		}
	}
}
